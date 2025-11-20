/************************************************************
 * foldEngine.js — 평면 매핑 안정 버전 + 힌지 정보만 계산
 *  - 2D 전개도와 모양/방향/색 100% 일치
 *  - 전개도는 3D에서도 가운데 평평하게 보이기만 함
 *  - hingeInfo(parent/axis/pivot)만 미리 계산 (회전은 아직 X)
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    let facesSorted = [];
    let nodes = [];             // face.id → TransformNode
    let netCenter = { x: 0, y: 0 };
    let hingeInfo = [];         // face.id → { parent, axis, pivot }

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

        // 외부에서 슬라이더로 호출할 함수 연결
        FoldEngine.setFoldProgress = setFoldProgress;
    };

    function setupCamera() {
        // 살짝 비스듬한 ArcRotate, 중심은 (0,0,0)
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
     * loadNet
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();
        if (!net || !net.faces) return;

        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        computeNetCenter();
        createMeshes();
        buildHingeTree(net.adjacency || []);
        layoutFlat();
        setFoldProgress(0);
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
        hingeInfo = [];
    }

    /************************************************************
     * 전개도 중심 계산 (cell 좌표계 기준)
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
     * 메쉬 생성
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
            mat.backFaceCulling = false;
            mat.disableLighting = true;

            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;

            // 회전을 위해 TransformNode를 부모로 둠
            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * parent-child 트리 만들기 (★ 아직 parent에 붙이진 않음)
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set([0]);
        const queue = [0];

        hingeInfo = [];
        hingeInfo[0] = { parent: null, axis: null, pivot: null };

        while (queue.length) {
            const parentId = queue.shift();

            const children = adjList.filter(a => a.from === parentId);
            children.forEach(a => {
                const childId = a.to;
                if (visited.has(childId)) return;

                visited.add(childId);
                queue.push(childId);

                const parent = facesSorted.find(f => f.id === parentId);
                const child  = facesSorted.find(f => f.id === childId);

                const hinge = computeHinge(parent, child);

                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot
                };
            });
        }

        console.log("HINGE INFO:", hingeInfo);
        // ⚠ 여기서는 parent-child를 아직 node에 적용하지 않는다.
        //   (현재 단계에서는 평면 전개도만 정확히 맞추는 것이 목표라서)
    }

    /************************************************************
     * parent-child 사이 힌지 축/피벗 계산
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;
        let axis = new BABYLON.Vector3(0, 0, 0);
        let pivot = new BABYLON.Vector3(0, 0, 0);

        if (child.v === parent.v - 1) {
            // child가 parent 위쪽
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0,  S / 2, 0);
        } else if (child.v === parent.v + 1) {
            // child가 parent 아래쪽
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0, -S / 2, 0);
        } else if (child.u === parent.u - 1) {
            // child가 parent 왼쪽
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3(-S / 2, 0, 0);
        } else if (child.u === parent.u + 1) {
            // child가 parent 오른쪽
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3( S / 2, 0, 0);
        }

        return { axis, pivot };
    }

    /************************************************************
     * 평면 배치: 2D와 동일 모양으로, 중심을 (0,0)에 맞춤
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;

        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * S;
            const y = (netCenter.y - cy) * S;

            node.position = new BABYLON.Vector3(x, y, 0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
        });

        if (camera) {
            camera.target = new BABYLON.Vector3(0, 0, 0);
        }
    }

    /************************************************************
     * foldProgress — 현재는 "항상 평면" 상태만 유지
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        // 아직은 회전 없이 항상 평면만 유지
        layoutFlat();
    }

    /************************************************************
     * main.js가 요구하는 나머지 API
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = (t) => setFoldProgress(t);
    FoldEngine.foldStaticTo    = (rad) => setFoldProgress(rad / (Math.PI / 2));
    FoldEngine.foldAnimate     = () => { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView  = () => Promise.resolve();
    FoldEngine.getFaceGroups   = () => nodes;

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
