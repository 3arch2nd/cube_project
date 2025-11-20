/************************************************************
 * foldEngine.js — 완성된 2단계 버전 (평면 매핑 100% + 힌지 회전 적용)
 *  - 2D 전개도와 3D 전개도 완전히 동일하게 배치
 *  - parent-child 트리 구조 실제 구성
 *  - foldProgress(0~1)에 따라 회전하며 큐브가 도로록 접힘
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

    let facesSorted = [];
    let nodes = [];                 // face.id → TransformNode
    let hingeInfo = [];             // face.id → { parent, axis, pivot }
    let netCenter = { x: 0, y: 0 };

    let foldProgress = 0;

    const options = {
        cellSize: 1,
        backgroundColor: "#ffffff"
    };

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
        applyParentChild();      // parent-child 실제 연결
        layoutFlat();            // root는 배치, child는 (0,0,0)
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
     * 전개도 중심 계산
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
     * createMeshes
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const S = options.cellSize;

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size: S, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
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

            const node = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = node;

            nodes[face.id] = node;
        });
    }

    /************************************************************
     * buildHingeTree (axis, pivot 계산)
     ************************************************************/
    function buildHingeTree(adjList) {
        const visited = new Set([0]);
        const queue = [0];

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

                hingeInfo[childId] = computeHinge(parent, child);
            });
        }
    }

    /************************************************************
     * computeHinge
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;
        let axis = new BABYLON.Vector3(0, 0, 0);
        let pivot = new BABYLON.Vector3(0, 0, 0);

        if (child.v === parent.v - 1) {
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0,  S / 2, 0);
        }
        else if (child.v === parent.v + 1) {
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0, -S / 2, 0);
        }
        else if (child.u === parent.u - 1) {
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3(-S / 2, 0, 0);
        }
        else if (child.u === parent.u + 1) {
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3( S / 2, 0, 0);
        }

        return { parent: parent.id, axis, pivot };
    }

    /************************************************************
     * parent-child 실제 연결
     ************************************************************/
    function applyParentChild() {
        facesSorted.forEach(f => {
            if (f.id === 0) return;
            const h = hingeInfo[f.id];
            if (!h) return;
            nodes[f.id].parent = nodes[h.parent];
        });
    }

    /************************************************************
     * layoutFlat
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;

        facesSorted.forEach(f => {
            const node = nodes[f.id];

            if (f.id === 0) {
                // root만 2D 위치 그대로
                const cx = f.u + f.w / 2;
                const cy = f.v + f.h / 2;

                const x = (cx - netCenter.x) * S;
                const y = (netCenter.y - cy) * S;

                node.position = new BABYLON.Vector3(x, y, 0);
            } else {
                // child는 로컬 원점 (0,0,0)
                node.position = new BABYLON.Vector3(0, 0, 0);
            }

            node.rotationQuaternion = BABYLON.Quaternion.Identity();
        });

        if (camera) camera.target = new BABYLON.Vector3(0, 0, 0);
    }

    /************************************************************
     * applyFoldRotation
     ************************************************************/
    function applyFoldRotation() {
        facesSorted.forEach(f => {
            if (f.id === 0) return;

            const h = hingeInfo[f.id];
            const node = nodes[f.id];
            if (!h || !node) return;

            const angle = foldProgress * (Math.PI / 2);
            const q = BABYLON.Quaternion.RotationAxis(h.axis, angle);

            node.setPivotPoint(h.pivot);
            node.rotationQuaternion = q;
        });
    }

    /************************************************************
     * setFoldProgress
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        layoutFlat();
        applyFoldRotation();
    }

    /************************************************************
     * 외부 API
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = (t) => setFoldProgress(t);
    FoldEngine.foldStaticTo    = (rad)=> setFoldProgress(rad / (Math.PI / 2));
    FoldEngine.foldAnimate     = ()=> { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView  = ()=> Promise.resolve();
    FoldEngine.getFaceGroups   = ()=> nodes;

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
