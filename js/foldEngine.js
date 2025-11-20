/************************************************************
 * foldEngine.js — 평면 매핑 + 힌지 접기 + 슬라이더 연동 최종본
 *  - 2D 전개도와 모양/방향/색 100% 일치 (t=0)
 *  - adjacency 를 이용해 parent-child(힌지 트리) 구성
 *  - foldProgress(0~1)에 따라 각 면이 90°까지 접힘
 *  - ArcRotateCamera 로 회전 가능
 *  - main.js / validator.js 가 기대하는 API 모두 구현
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    // 현재 전개도 정보
    let facesSorted = [];          // id 오름차순 faces
    let nodes = [];                // face.id → TransformNode
    let netCenter = { x: 0, y: 0 };// cell 좌표계 중심
    let hingeInfo = [];            // face.id → { parent, axis, pivot, dir }

    const options = {
        cellSize: 1,
        backgroundColor: "#ffffff"
    };

    let foldProgress = 0;          // 0 = 완전 펼침, 1 = 완전 접힘

    /************************************************************
     * INIT
     ************************************************************/
    FoldEngine.init = function (canvasElement, eng, scn) {
        canvas = canvasElement;

        if (eng && scn) {
            engine = eng;
            scene = scn;
        } else {
            engine = new BABYLON.Engine(canvas, true);
            scene = new BABYLON.Scene(engine);
        }

        setupCamera();
        setupEnvironment();
        startRenderLoop();

        // 슬라이더에서 직접 호출할 수 있도록 노출
        FoldEngine.setFoldProgress = setFoldProgress;
    };

    function setupCamera() {
        // 살짝 비스듬한 시점의 ArcRotate 카메라
        camera = new BABYLON.ArcRotateCamera(
            "cubeCam",
            -Math.PI / 2,
            Math.PI / 2.2,
            8,
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);
    }

    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
        new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0, 1, 0), scene);
    }

    /************************************************************
     * loadNet(net)
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        // id 순으로 정렬
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        computeNetCenter();
        createMeshes();
        buildHingeTree(net.adjacency || []);
        layoutFlat();              // t=0 기준 위치
        setFoldProgress(0);        // 회전 0으로 초기화
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
        hingeInfo = [];
    }

    /************************************************************
     * 전개도 중심 계산 (cell 좌표 기준)
     ************************************************************/
    function computeNetCenter() {
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        facesSorted.forEach(f => {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;
    }

    /************************************************************
     * 메쉬 생성 (각 face.id당 TransformNode 하나)
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const size = options.cellSize;

            // 실제 사각형(plane)
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size: size, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            const col = face.color || "#999999";
            mat.emissiveColor = BABYLON.Color3.FromHexString(col);
            mat.backFaceCulling = false;
            mat.disableLighting = true;

            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;

            // 회전을 제어할 TransformNode
            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * parent-child 트리 + 힌지 정보 계산
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set();
        const queue = [];

        // root 는 0번 face 라고 가정
        visited.add(0);
        queue.push(0);

        hingeInfo = [];
        hingeInfo[0] = { parent: null, axis: null, pivot: null, dir: 0 };

        while (queue.length) {
            const parentId = queue.shift();

            // parentId에서 뻗어나가는 모서리들
            const children = adjList.filter(a => a.from === parentId);
            children.forEach(a => {
                const childId = a.to;
                if (visited.has(childId)) return;

                visited.add(childId);
                queue.push(childId);

                const parentFace = facesSorted.find(f => f.id === parentId);
                const childFace  = facesSorted.find(f => f.id === childId);
                if (!parentFace || !childFace) return;

                const hinge = computeHinge(parentFace, childFace);

                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot,
                    dir: hinge.dir
                };
            });
        }

        // 실제 TransformNode 트리 구성
        facesSorted.forEach(face => {
            if (face.id === 0) return; // root

            const info = hingeInfo[face.id];
            if (!info || info.parent == null) return;

            const parentNode = nodes[info.parent];
            const node = nodes[face.id];
            if (parentNode && node) {
                node.parent = parentNode;
            }
        });

        console.log("HINGE INFO:", hingeInfo);
    }

    /************************************************************
     * parent-child 사이 힌지 축/피벗 계산
     *  - 축(axis): 회전 방향 벡터
     *  - 피벗(pivot): child 면의 중심에서 본 접히는 모서리 위치
     *  - dir: +1/-1, foldProgress에 곱해 줄 회전 부호
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;
        let axis = new BABYLON.Vector3(0, 0, 0);
        let pivot = new BABYLON.Vector3(0, 0, 0);
        let dir = 1;

        // 위/아래 방향 (v 차이)
        if (child.v === parent.v - 1) {
            // child 가 parent 위쪽
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0,  S / 2, 0);
            dir = -1;
        } else if (child.v === parent.v + 1) {
            // child 가 parent 아래쪽
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0, -S / 2, 0);
            dir = 1;
        }
        // 좌/우 방향 (u 차이)
        else if (child.u === parent.u - 1) {
            // child 가 parent 왼쪽
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3(-S / 2, 0, 0);
            dir = 1;
        } else if (child.u === parent.u + 1) {
            // child 가 parent 오른쪽
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3( S / 2, 0, 0);
            dir = -1;
        }

        return { axis, pivot, dir };
    }

    /************************************************************
     * 평면 배치: 2D와 완전 동일하게, 중심을 (0,0)에 맞춤
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;

        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;

            // 면 중심 좌표
            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            // 전개도 중심 보정
            const x = (cx - netCenter.x) * S;
            const y = (netCenter.y - cy) * S;

            node.position = new BABYLON.Vector3(x, y, 0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero());
        });

        if (camera) {
            camera.target = new BABYLON.Vector3(0, 0, 0);
        }
    }

    /************************************************************
     * foldProgress(0~1)에 따라 힌지 회전 적용
     ************************************************************/
    function applyFold() {
        const maxAngle = Math.PI / 2; // 90도

        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;

            if (f.id === 0) {
                // root face : 평면 유지
                node.rotationQuaternion = BABYLON.Quaternion.Identity();
                node.setPivotPoint(BABYLON.Vector3.Zero());
                return;
            }

            const info = hingeInfo[f.id];
            if (!info || !info.axis) return;

            const angle = maxAngle * foldProgress * info.dir;

            node.setPivotPoint(info.pivot);
            node.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
                info.axis,
                angle
            );
        });
    }

    /************************************************************
     * 외부에서 호출되는 foldProgress 설정 함수
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        applyFold();
    }

    /************************************************************
     * main.js / validator.js 가 요구하는 나머지 API
     ************************************************************/
    FoldEngine.unfoldImmediate = () => {
        foldProgress = 0;
        layoutFlat();
        applyFold();
    };

    FoldEngine.foldImmediate = () => {
        foldProgress = 1;
        layoutFlat();   // 항상 같은 기준에서 접히도록
        applyFold();
    };

    FoldEngine.foldTo = (t) => {
        setFoldProgress(t);
    };

    FoldEngine.foldStaticTo = (rad) => {
        const t = rad / (Math.PI / 2); // 0~π/2 → 0~1
        setFoldProgress(t);
    };

    FoldEngine.foldAnimate = (durationSec = 1.5) => {
        // 간단한 선형 애니메이션
        return new Promise(resolve => {
            const start = performance.now();
            const startT = foldProgress;

            const step = (now) => {
                const dt = (now - start) / (durationSec * 1000);
                if (dt >= 1) {
                    setFoldProgress(1);
                    resolve();
                    return;
                }
                const t = startT + (1 - startT) * dt;
                setFoldProgress(t);
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    };

    FoldEngine.showSolvedView = () => {
        // 접힌 후 살짝 위쪽에서 내려다보는 시점으로
        if (camera) {
            camera.alpha = -Math.PI / 4;
            camera.beta  = Math.PI / 3;
            camera.radius = 6;
            camera.target = new BABYLON.Vector3(0, 0, 0);
        }
        return Promise.resolve();
    };

    // validator에서 사용하는 face group
    FoldEngine.getFaceGroups = () => nodes;

    /************************************************************
     * Render Loop
     ************************************************************/
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = () => {
        if (engine) engine.resize();
    };

})();
