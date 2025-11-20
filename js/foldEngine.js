/************************************************************
 * foldEngine.js — 평면 매핑 + 힌지 접기 (Babylon)
 *  - 2D 전개도와 3D 전개도 좌표/색 100% 일치
 *  - net.adjacency의 dir(up/down/left/right)을 이용해 힌지 축 계산
 *  - foldProgress(0~1)에 따라 0°→90°까지 회전
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    let facesSorted = [];          // id 순 정렬된 face 배열
    let nodes = [];                // face.id -> TransformNode
    let hingeInfo = [];            // face.id -> { parent, axis, pivot }

    const options = {
        cellSize: 1,
        backgroundColor: "#ffffff"
    };

    let foldProgress = 0;          // 0 = 펼침, 1 = 완전 접힘

    /************************************************************
     * INIT
     ************************************************************/
    FoldEngine.init = function (canvasElement, eng, scn) {
        canvas = canvasElement;

        if (eng && scn) {
            engine = eng;
            scene  = scn;
        } else {
            engine = new BABYLON.Engine(canvas, true);
            scene  = new BABYLON.Scene(engine);
        }

        setupCamera();
        setupEnvironment();
        startRenderLoop();
    };

    function setupCamera() {
        camera = new BABYLON.ArcRotateCamera(
            "cubeCam",
            -Math.PI / 2,       // 왼쪽에서 시작
            Math.PI / 2.1,      // 거의 위에서 내려다보는 각도
            8,
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 3;
        camera.upperRadiusLimit = 20;
    }

    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);

        const light = new BABYLON.HemisphericLight(
            "hemi",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
        light.intensity = 0.8;
    }

    /************************************************************
     * loadNet
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        // id 순 정렬
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        createMeshes();
        buildHingeTree(net.adjacency || []);
        layoutFlat();          // 2D와 동일한 평면 배치
        setFoldProgress(0);    // 항상 펼친 상태로 시작
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
        hingeInfo = [];
    }

    /************************************************************
     * 메쉬 생성 (face별 TransformNode + Plane)
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
            const col = face.color || "#999999";
            mat.emissiveColor = BABYLON.Color3.FromHexString(col);
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;

            // 회전/이동을 담당하는 부모 노드
            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            // plane은 부모 중심에 그대로 놓기
            plane.position = new BABYLON.Vector3(0, 0, 0);

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * parent-child 트리 + 힌지 축 계산
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        // root = id 0
        const ROOT_ID = 0;
        const visited = new Set([ROOT_ID]);
        const queue = [ROOT_ID];

        hingeInfo[ROOT_ID] = { parent: null, axis: null, pivot: null };

        while (queue.length) {
            const parentId = queue.shift();

            const children = adjList.filter(a => a.from === parentId);
            children.forEach(a => {
                const childId = a.to;
                if (visited.has(childId)) return;

                visited.add(childId);
                queue.push(childId);

                const hinge = computeHingeFromDir(a.dir);
                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot
                };
            });
        }

        // 실제 TransformNode 트리 구성 + 피벗 설정
        facesSorted.forEach(face => {
            const id = face.id;
            if (id === ROOT_ID) return;

            const h = hingeInfo[id];
            if (!h) return;

            const parentNode = nodes[h.parent];
            const node       = nodes[id];

            node.parent = parentNode;
            node.setPivotPoint(h.pivot);
        });

        // 디버깅용
        console.log("HINGE INFO:", hingeInfo);
    }

    // adjacency.dir 기준으로 축/피벗 계산
    function computeHingeFromDir(dir) {
        const S = options.cellSize;
        switch (dir) {
            case "up":       // child가 parent 위쪽 (v-1)
                return {
                    axis:  new BABYLON.Vector3(1, 0, 0),      // x축 회전
                    pivot: new BABYLON.Vector3(0, -S / 2, 0)  // child의 아래쪽 변
                };
            case "down":     // child가 parent 아래쪽 (v+1)
                return {
                    axis:  new BABYLON.Vector3(-1, 0, 0),     // 반대 방향
                    pivot: new BABYLON.Vector3(0,  S / 2, 0)  // child의 위쪽 변
                };
            case "left":     // child가 parent 왼쪽 (u-1)
                return {
                    axis:  new BABYLON.Vector3(0, -1, 0),     // y축 회전
                    pivot: new BABYLON.Vector3(S / 2, 0, 0)   // child의 오른쪽 변
                };
            case "right":    // child가 parent 오른쪽 (u+1)
                return {
                    axis:  new BABYLON.Vector3(0, 1, 0),
                    pivot: new BABYLON.Vector3(-S / 2, 0, 0)  // child의 왼쪽 변
                };
            default:
                return {
                    axis:  new BABYLON.Vector3(0, 0, 0),
                    pivot: new BABYLON.Vector3(0, 0, 0)
                };
        }
    }

    /************************************************************
     * 평면 배치 (2D 전개도와 1:1 매핑)
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;

        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;

            // 2D 좌표 (u,v)를 그대로 3D (x,y)에 반영
            const x = f.u * S;
            const y = -f.v * S;

            node.position = new BABYLON.Vector3(x, y, 0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
        });

        if (camera) {
            camera.target = new BABYLON.Vector3(0, 0, 0);
        }
    }

    /************************************************************
     * foldProgress 적용: 0~1 → 0°~90°
     ************************************************************/
    function applyFold() {
        facesSorted.forEach(face => {
            const id = face.id;
            const node = nodes[id];
            if (!node) return;

            // 기본은 평면 상태
            let q = BABYLON.Quaternion.Identity();

            if (id !== 0) {
                const h = hingeInfo[id];
                if (h && h.axis) {
                    const angle = foldProgress * (Math.PI / 2); // 최대 90도
                    q = BABYLON.Quaternion.RotationAxis(h.axis, angle);
                }
            }

            node.rotationQuaternion = q;
        });
    }

    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        applyFold();
    }
    FoldEngine.setFoldProgress = setFoldProgress;

    /************************************************************
     * main.js / html 이 사용하는 보조 API
     ************************************************************/
    FoldEngine.unfoldImmediate = function () {
        setFoldProgress(0);
    };

    FoldEngine.foldImmediate = function () {
        setFoldProgress(1);
    };

    FoldEngine.foldTo = function (t) {
        setFoldProgress(t);
    };

    FoldEngine.foldStaticTo = function (rad) {
        // rad = 0 ~ π/2
        const t = rad / (Math.PI / 2);
        setFoldProgress(t);
    };

    FoldEngine.foldAnimate = function () {
        // 간단 버전: 바로 1로
        setFoldProgress(1);
        return Promise.resolve();
    };

    FoldEngine.showSolvedView = function () {
        // 나중에 카메라 연출을 넣고 싶으면 여기서 조절
        return Promise.resolve();
    };

    // Validator용
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    /************************************************************
     * Render Loop / Resize
     ************************************************************/
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(function () {
            scene.render();
        });
    }

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
