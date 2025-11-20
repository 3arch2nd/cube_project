/************************************************************
 * foldEngine.js — 평면 매핑 안정 버전 (Center Anchored Patch)
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
    let nodes = [];
    let hingeInfo = [];

    const options = {
        cellSize: 1,
        backgroundColor: "#ffffff"
    };

    let foldProgress = 0;
    let netCenter = { x: 0, y: 0 };

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

        computeNetCenter(net.faces);

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
     * 전개도 중심 계산
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
     * BFS hinge tree
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

        const visited = new Set([0]);
        const queue = [0];

        hingeInfo[0] = { parent: null, axis: null, pivot: null };

        while (queue.length) {
            const parentId = queue.shift();

            adjList.filter(a => a.from === parentId).forEach(a => {
                const childId = a.to;
                if (visited.has(childId)) return;

                visited.add(childId);
                queue.push(childId);

                const parent = facesSorted.find(f => f.id === parentId);
                const child = facesSorted.find(f => f.id === childId);

                hingeInfo[childId] = computeHinge(parent, child);
                hingeInfo[childId].parent = parentId;
            });
        }

        console.log("HINGE INFO:", hingeInfo);
    }

    function computeHinge(parent, child) {
        const S = options.cellSize;

        if (child.v === parent.v - 1)
            return { axis: new BABYLON.Vector3(1, 0, 0), pivot: new BABYLON.Vector3(0, S/2, 0) };
        if (child.v === parent.v + 1)
            return { axis: new BABYLON.Vector3(1, 0, 0), pivot: new BABYLON.Vector3(0,-S/2, 0) };
        if (child.u === parent.u - 1)
            return { axis: new BABYLON.Vector3(0, 1, 0), pivot: new BABYLON.Vector3(-S/2, 0, 0) };
        if (child.u === parent.u + 1)
            return { axis: new BABYLON.Vector3(0, 1, 0), pivot: new BABYLON.Vector3( S/2, 0, 0) };

        return { axis: new BABYLON.Vector3(0,0,0), pivot: new BABYLON.Vector3(0,0,0) };
    }

    /************************************************************
     * 평면 배치 + 카메라 자동 중심 맞춤
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;
        
        let sumX = 0, sumY = 0, count = 0;

        facesSorted.forEach(f => {
            const node = nodes[f.id];
            if (!node) return;

            const cx = f.u + f.w/2;
            const cy = f.v + f.h/2;

            const x = (cx - netCenter.x) * S;
            const y = (netCenter.y - cy) * S;

            node.position = new BABYLON.Vector3(x, y, 0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();

            sumX += x;
            sumY += y;
            count++;
        });

        // center
        const centerX = sumX / count;
        const centerY = sumY / count;

        if (camera) {
            camera.target = new BABYLON.Vector3(centerX, centerY, 0);
        }
    }

    /************************************************************
 * foldProgress — 회전 적용 (HINGE 적용)
 ************************************************************/
function setFoldProgress(t) {
    foldProgress = Math.max(0, Math.min(1, t));

    const angle = foldProgress * (Math.PI / 2); // 0~90°

    // 모든 면 초기화
    facesSorted.forEach(f => {
        const node = nodes[f.id];
        node.rotationQuaternion = BABYLON.Quaternion.Identity();
        node.setPivotPoint(BABYLON.Vector3.Zero());
    });

    // root는 회전 없음
    const queue = [0];
    const visited = new Set([0]);

    while (queue.length) {
        const parent = queue.shift();

        hingeInfo.forEach((hinge, id) => {
            if (!hinge || hinge.parent !== parent) return;
            if (visited.has(id)) return;

            visited.add(id);
            queue.push(id);

            const node = nodes[id];

            // 힌지 피벗 설정
            node.setPivotPoint(hinge.pivot);

            // 회전축 quaternion 적용
            const q = BABYLON.Quaternion.RotationAxis(hinge.axis, angle);

            node.rotationQuaternion = q;
        });
    }

    // 위치는 평면 배치 고정
    layoutFlat();
}


    /************************************************************
     * API
     ************************************************************/
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate   = () => setFoldProgress(1);
    FoldEngine.foldTo          = (t) => setFoldProgress(t);
    FoldEngine.foldStaticTo    = (rad) => setFoldProgress(rad / (Math.PI/2));
    FoldEngine.foldAnimate     = () => { setFoldProgress(1); return Promise.resolve(); };
    FoldEngine.showSolvedView  = () => Promise.resolve();
    FoldEngine.getFaceGroups   = () => nodes;

    /************************************************************
     * Babylon Loop
     ************************************************************/
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(() => scene.render());
    }

    FoldEngine.onResize = () => {
        if (engine) engine.resize();
    };

})();
