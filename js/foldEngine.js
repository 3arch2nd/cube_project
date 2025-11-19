/**
 * foldEngine.js — Babylon 평면 전개도 엔진 (최종 안정 버전)
 * 2D 전개도와 3D 정렬/색상 완전 일치
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
    FoldEngine.init = function (canvasElement, babylonEngine, babylonScene) {
        canvas = canvasElement;

        engine = babylonEngine || new BABYLON.Engine(canvas, true);
        scene  = babylonScene  || new BABYLON.Scene(engine);

        setupCamera();
        setupEnvironment();
        startRenderLoop();
    };

    // ------------------------------------------------------------
    // CAMERA
    // ------------------------------------------------------------
    function setupCamera() {
        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );

        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        const ortho = 3;
        camera.orthoLeft   = -ortho;
        camera.orthoRight  =  ortho;
        camera.orthoTop    =  ortho;
        camera.orthoBottom = -ortho;

        camera.minZ = -100;
        camera.maxZ = 1000;
        camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    }

    // ------------------------------------------------------------
    // BACKGROUND
    // ------------------------------------------------------------
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

        facesSorted = net.faces.slice();
        computeNetCenter();

        createFaceMeshes();
        layoutFlat2D();

        updateCameraTarget();   // ⭐ 도형 중심으로 카메라 이동
    };

    // ------------------------------------------------------------
    // DISPOSE NODES
    // ------------------------------------------------------------
    function disposeAll() {
        nodes.forEach(n => n && n.dispose && n.dispose());
        nodes = [];
    }

    // ------------------------------------------------------------
    // computeNetCenter (이름도 정확히 맞춤)
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // createFaceMeshes
    // ------------------------------------------------------------
    function createFaceMeshes() {
        const size = options.cellSize;

        facesSorted.forEach(face => {
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            const c3  = BABYLON.Color3.FromHexString(face.color || "#888888");

            mat.emissiveColor = c3;
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            nodes[face.id] = plane;
        });
    }

    // ------------------------------------------------------------
    // 2D → 3D 매핑 (좌우반전 없이 그대로)
    // ------------------------------------------------------------
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];
            if (!plane) return;

            // 2D 좌표 그대로 Babylon에 맵핑
            plane.position = new BABYLON.Vector3(
                (f.u - netCenter.x) * size,
                -(f.v - netCenter.y) * size,
                0
            );
        });
    }

    // ------------------------------------------------------------
    // ⭐ 도형 중심으로 카메라 타겟 이동 (Babylon 안전 방식)
    // ------------------------------------------------------------
    function updateCameraTarget() {
        if (!camera) return;

        camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    }

    // ============================================================
    // 접기 함수는 스텁
    // ============================================================
    FoldEngine.unfoldImmediate = layoutFlat2D;
    FoldEngine.unfold = layoutFlat2D;

    FoldEngine.foldImmediate = function(){};
    FoldEngine.foldStaticTo = function(){};
    FoldEngine.foldTo = function(){};
    FoldEngine.foldAnimate = () => Promise.resolve();
    FoldEngine.showSolvedView = () => Promise.resolve();

    FoldEngine.getFaceGroups = () => nodes;

    // ============================================================
    // RENDER LOOP
    // ============================================================
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(() => scene.render());
    }

    FoldEngine.onResize = () => engine && engine.resize();

})();
