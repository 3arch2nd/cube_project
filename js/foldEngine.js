/************************************************************
 * foldEngine.js — 정육면체 전개도용 FoldEngine (1차 완성본)
 *  - 2D 전개도와 3D 평면 배치 100% 정렬
 *  - net.adjacency 기반으로 힌지(부모/축/피벗) 계산
 *  - foldProgress(0~1)에 따라 각 면이 0~90°까지 접힘
 *  - ArcRotateCamera로 회전 가능
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    let facesSorted = [];      // id 순 정렬된 face 목록
    let nodes = [];            // face.id → TransformNode
    let hingeInfo = [];        // face.id → { parent, axis, pivot }
    let netCenter = { x: 0, y: 0 }; // 2D 전개도 중심 (cell 좌표계)

    const options = {
        cellSize: 1,
        backgroundColor: "#ffffff"
    };

    let foldProgress = 0;

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

        // 외부에서 직접 슬라이더로 호출
        FoldEngine.setFoldProgress = setFoldProgress;
    };

    function setupCamera() {
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

        new BABYLON.HemisphericLight(
            "h",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
    }

    /************************************************************
     * loadNet
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        // id 기준 정렬
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        computeNetCenter(facesSorted);
        createMeshes();
        layoutFlat();                  // 먼저 평면에 정확히 배치
        buildHingeTree(net.adjacency || []);  // 힌지 계산 + parent 연결
        setFoldProgress(0);            // 완전 펼친 상태로 시작
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
        hingeInfo = [];
        facesSorted = [];
    }

    /************************************************************
     * 전개도 중심 계산 (cell 좌표계)
     ************************************************************/
    function computeNetCenter(faces) {
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        faces.forEach(f => {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;
    }

    /************************************************************
     * 메쉬 생성 (Plane + TransformNode)
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const size = options.cellSize;

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size: size, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            mat.emissiveColor = BABYLON.Color3.FromHexString(face.color || "#999999");
            mat.backFaceCulling = false;
            mat.disableLighting = true;

            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;

            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * 평면 배치 (2D 전개도와 100% 일치)
     *  - 이 시점에서는 parent 없음, 모두 world 좌표로 배치
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;

        let sumX = 0, sumY = 0, count = 0;

        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * S;
            const y = (netCenter.y - cy) * S;

            node.position = new BABYLON.Vector3(x, y, 0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();

            sumX += x;
            sumY += y;
            count++;
        });

        const centerX = sumX / count;
        const centerY = sumY / count;

        if (camera) {
            camera.target = new BABYLON.Vector3(centerX, centerY, 0);
        }
    }

    /************************************************************
     * BFS로 hinge 트리 구성 + TransformNode parent 계층 적용
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set([0]);
        const queue = [0];

        hingeInfo = [];
        hingeInfo[0] = { parent: null, axis: null, pivot: null };

        while (queue.length) {
            const parentId = queue.shift();

            adjList
                .filter(a => a.from === parentId)
                .forEach(a => {
                    const childId = a.to;
                    if (visited.has(childId)) return;

                    visited.add(childId);
                    queue.push(childId);

                    const parent = facesSorted.find(f => f.id === parentId);
                    const child  = facesSorted.find(f => f.id === childId);

                    const hinge = computeHinge(parent, child);
                    hinge.parent = parentId;

                    hingeInfo[childId] = hinge;
                });
        }

        // ★ 지금까지는 모든 node가 world 좌표에 독립적으로 배치된 상태.
        //   이 world 좌표를 유지한 채 parent-child 계층만 적용한다.
        //   (회전은 아직 Identity라서 world = parent + local)
        const rootNode = nodes[0];
        if (rootNode) rootNode.parent = null;

        const q = [0];
        const used = new Set([0]);

        while (q.length) {
            const pid = q.shift();

            hingeInfo.forEach((h, id) => {
                if (!h || h.parent !== pid) return;
                if (used.has(id)) return;

                used.add(id);
                q.push(id);

                const parentNode = nodes[pid];
                const childNode  = nodes[id];
                if (!parentNode || !childNode) return;

                // 현재 world 좌표 저장
                const worldPos = childNode.position.clone();

                // parent 설정 후, local position 보정
                childNode.parent = parentNode;
                childNode.position = worldPos.subtract(parentNode.position);
            });
        }

        console.log("HINGE INFO:", hingeInfo);
    }

    /************************************************************
     * parent-child 사이 hinge 축/피벗 계산
     *  - pivot 은 child 면의 로컬 좌표계에서, 공유 모서리의 중앙
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;

        // child 가 parent 의 어느 쪽에 붙었는지 2D 좌표로 판단
        if (child.v === parent.v - 1) {
            // child 가 parent 위
            return {
                parent: parent.id,
                axis:  new BABYLON.Vector3(1, 0, 0),
                pivot: new BABYLON.Vector3(0,  S / 2, 0)
            };
        }
        if (child.v === parent.v + 1) {
            // child 가 parent 아래
            return {
                parent: parent.id,
                axis:  new BABYLON.Vector3(1, 0, 0),
                pivot: new BABYLON.Vector3(0, -S / 2, 0)
            };
        }
        if (child.u === parent.u - 1) {
            // child 가 parent 왼쪽
            return {
                parent: parent.id,
                axis:  new BABYLON.Vector3(0, 1, 0),
                pivot: new BABYLON.Vector3(-S / 2, 0, 0)
            };
        }
        if (child.u === parent.u + 1) {
            // child 가 parent 오른쪽
            return {
                parent: parent.id,
                axis:  new BABYLON.Vector3(0, 1, 0),
                pivot: new BABYLON.Vector3( S / 2, 0, 0)
            };
        }

        // 예외: 직접 붙어있지 않은 경우 (사실상 나오지 않아야 함)
        return {
            parent: parent.id,
            axis:  new BABYLON.Vector3(0, 0, 0),
            pivot: new BABYLON.Vector3(0, 0, 0)
        };
    }

    /************************************************************
     * foldProgress — 0: 펼침, 1: 각 hinge 90° 회전
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        const angle = foldProgress * (Math.PI / 2); // 0~90°

        // 모든 면 회전 초기화
        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
            node.setPivotPoint(BABYLON.Vector3.Zero());
        });

        if (foldProgress === 0) {
            // 완전 펼침 상태면 여기서 끝
            return;
        }

        // root(0)는 회전 없음
        for (let i = 1; i < hingeInfo.length; i++) {
            const hinge = hingeInfo[i];
            if (!hinge) continue;

            const node = nodes[i];
            if (!node) continue;

            node.setPivotPoint(hinge.pivot);
            node.rotationQuaternion =
                BABYLON.Quaternion.RotationAxis(hinge.axis, angle);
        }
    }

    /************************************************************
     * main.js / validator.js 가 사용하는 공개 API
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = (t) => setFoldProgress(t);
    FoldEngine.foldStaticTo    = (rad) => setFoldProgress(rad / (Math.PI / 2));
    FoldEngine.foldAnimate     = () => { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView  = () => Promise.resolve();
    FoldEngine.getFaceGroups   = () => nodes;

    /************************************************************
     * Babylon render loop
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
