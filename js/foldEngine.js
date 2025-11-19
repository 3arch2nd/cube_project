/**
 * foldEngine.js — 2D 전개도와 1:1로 맞춘 Babylon 평면 버전 (최종완성)
 */

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

    const options = {
        cellSize: 1.0,
        backgroundColor: "#ffffff"
    };

    // ============================================================
    // INIT
    // ============================================================
    FoldEngine.init = function (canvasElement) {
        canvas = canvasElement;

        engine = new BABYLON.Engine(canvas, true);
        scene = new BABYLON.Scene(engine);

        setupCamera();
        setupEnvironment();
        startRenderLoop();
    };

    // ============================================================
    // CAMERA — 정면 + 직교
    // ============================================================
    function setupCamera() {
        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );
        camera.setTarget(new BABYLON.Vector3(0, 0, 0));
        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        const orthoSize = 4;
        camera.orthoLeft   = -orthoSize;
        camera.orthoRight  =  orthoSize;
        camera.orthoTop    =  orthoSize;
        camera.orthoBottom = -orthoSize;

        camera.minZ = 0.1;
        camera.maxZ = 1000;
    }

    // ============================================================
    // BACKGROUND
    // ============================================================
    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
    }

    // ============================================================
    // PUBLIC: loadNet
    // ============================================================
    FoldEngine.loadNet = function (net) {
        disposeAll();

        if (!net || !net.faces) return;

        facesSorted = net.faces.slice(); // color 포함한 원본 그대로 유지

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();
    };

    // ============================================================
    // CLEANUP
    // ============================================================
    function disposeAll() {
        nodes = [];
    }

    // ============================================================
    // CENTER
    // ============================================================
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

    // ============================================================
    // CREATE PLANES (색상 1:1, 좌우뒤집힘 없음)
    // ============================================================
    function createFaceMeshes() {
        const size = options.cellSize;

        facesSorted.forEach(face => {
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                {
                    size: size,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE
                },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            const c3  = BABYLON.Color3.FromHexString(face.color || "#999999");

            mat.emissiveColor = c3;
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            plane.material = mat;

            // 🔥 좌우뒤집힘 방지 (plane의 기본 UV 방향 보정)
            plane.rotation = new BABYLON.Vector3(0, Math.PI, 0);

            // 🔥 nodes를 index가 아니라 id로 정확히 배치
            nodes[face.id] = plane;
        });
    }

    // ============================================================
    // POSITION (2D와 동일한 x,y)
    // ============================================================
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * size;
            const y = (netCenter.y - cy) * size;

            plane.position = new BABYLON.Vector3(x, y, 0);
        });
    }

    // ============================================================
    // STUBS (접기 X)
    // ============================================================
    FoldEngine.unfoldImmediate = layoutFlat2D;
    FoldEngine.unfold = layoutFlat2D;
    FoldEngine.reset = layoutFlat2D;
    FoldEngine.foldImmediate = function(){};
    FoldEngine.foldTo = function(){};
    FoldEngine.foldStaticTo = function(){};
    FoldEngine.foldAnimate = function(){ return Promise.resolve(); };
    FoldEngine.showSolvedView = function(){ return Promise.resolve(); };

    FoldEngine.getFaceGroups = () => nodes;

    // ============================================================
    // RENDER LOOP
    // ============================================================
    function startRenderLoop() {
        engine.runRenderLoop(() => scene.render());
    }

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
