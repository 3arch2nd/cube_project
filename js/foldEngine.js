/************************************************************
 * foldEngine.js — 평면 매핑 안정 버전 (힌지는 다음 단계)
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
    };

    function setupCamera() {
        camera = new BABYLON.ArcRotateCamera(
            "cubeCam",
            -Math.PI / 2,
            Math.PI / 2.15,
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
        layoutFlat();
        setFoldProgress(0);
    };

    function disposeAll() {
        nodes.forEach(n => n?.dispose?.());
        nodes = [];
    }

    /************************************************************
     * Mesh 생성
     ************************************************************/
    function createMeshes() {
        facesSorted.forEach(face => {
            const size = options.cellSize;

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
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

            const tnode = new BABYLON.TransformNode("node_" + face.id, scene);
            plane.parent = tnode;

            nodes[face.id] = tnode;
        });
    }

    /************************************************************
     * 전개도 중심 계산
     ************************************************************/
    function computeNetCenter() {
        let minU = 999, maxU = -999;
        let minV = 999, maxV = -999;

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
     * 2D 전개도→3D 평면 배치
     ************************************************************/
    function layoutFlat() {
        const S = options.cellSize;

        facesSorted.forEach(f => {
            const node = nodes[f.id];

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * S;
            const y = (netCenter.y - cy) * S;

            node.position = new BABYLON.Vector3(x, y, 0);
            node.rotationQuaternion = BABYLON.Quaternion.Identity();
        });

        if (camera) camera.target = new BABYLON.Vector3(0, 0, 0);
    }

    /************************************************************
     * foldProgress (1단계: 평면 유지)
     ************************************************************/
    function setFoldProgress(t) {
        foldProgress = Math.max(0, Math.min(1, t));
        layoutFlat();
    }

    FoldEngine.setFoldProgress = setFoldProgress;
    FoldEngine.unfoldImmediate = () => setFoldProgress(0);
    FoldEngine.foldImmediate = () => setFoldProgress(1);
    FoldEngine.foldTo = t => setFoldProgress(t);

    FoldEngine.getFaceGroups = () => nodes;

    /************************************************************
     * Render loop
     ************************************************************/
    function startRenderLoop() {
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = () => engine.resize();

})();
