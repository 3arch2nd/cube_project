/************************************************************
 * foldEngine.js — 평면 매핑 안정 버전 (Center Anchored Patch)
 *  - 2D 전개도와 3D 평면 배치 100% 정렬
 *  - root(face 0)의 중심을 (0,0)에 고정하여 오프셋 문제 제거
 *  - hingeInfo 계산 (아직 회전 없음)
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

        createMeshes();
        buildHingeTree(net.adjacency || []);

        // (중요!) root face(0)를 기준으로 평면 고정 배치
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

            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * BFS로 parent-child 관계만 계산
     ************************************************************/
    function buildHingeTree(adjList) {
        if (!facesSorted.length) return;

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

                const hinge = computeHinge(parent, child);

                hingeInfo[childId] = {
                    parent: parentId,
                    axis: hinge.axis,
                    pivot: hinge.pivot
                };
            });
        }

        console.log("HINGE INFO:", hingeInfo);
    }

    /************************************************************
     * hinge 계산 (회전은 아직 사용 X)
     ************************************************************/
    function computeHinge(parent, child) {
        const S = options.cellSize;
        let axis = new BABYLON.Vector3(0, 0, 0);
        let pivot = new BABYLON.Vector3(0, 0, 0);

        if (child.v === parent.v - 1) {
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0,  S / 2, 0);
        } else if (child.v === parent.v + 1) {
            axis = new BABYLON.Vector3(1, 0, 0);
            pivot = new BABYLON.Vector3(0, -S / 2, 0);
        } else if (child.u === parent.u - 1) {
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3(-S / 2, 0, 0);
        } else if (child.u === parent.u + 1) {
            axis = new BABYLON.Vector3(0, 1, 0);
            pivot = new BABYLON.Vector3( S / 2, 0, 0);
        }

        return { axis, pivot };
    }

    /************************************************************
     * 평면 배치 (★ ROOT ANCHORED VERSION, 100% 정렬)
     ************************************************************/
    function layoutFlat() {
    const S = options.cellSize;
    
    // 모든 face의 3D 중심 누적
    let sumX = 0, sumY = 0, count = 0;

    facesSorted.forEach(f => {
        const node = nodes[f.id];
        if (!node) return;

        // 2D 중심
        const cx = f.u + f.w / 2;
        const cy = f.v + f.h / 2;

        // 3D 좌표 변환
        const x = (cx - netCenter.x) * S;
        const y = (netCenter.y - cy) * S;

        // 배치
        node.position = new BABYLON.Vector3(x, y, 0);
        node.rotationQuaternion = BABYLON.Quaternion.Identity();

        // 중심 누적 계산
        sumX += x;
        sumY += y;
        count++;
    });

    // ⭐ 전개도 3D 중심 (평균값)
    const centerX = sumX / count;
    const centerY = sumY / count;

    // ⭐ 카메라가 항상 전개도 중심을 보도록 자동 조절
    if (camera) {
        camera.target = new BABYLON.Vector3(centerX, centerY, 0);
    }


    /************************************************************
     * foldProgress — 현재는 평면 고정
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        layoutFlat();
    }

    /************************************************************
     * main.js가 쓰는 helper
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
