/**
 * foldEngine.js — 디버그 확정 버전 (화면 표시 우선)
 * ------------------------------------------------------------
 * - 2D 전개도와 동일한 위치에 plane을 정확히 표시
 * - 카메라 오소그래픽 확대
 * - plane 양면 렌더링
 * - 디버그 표시 포함
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
    // CAMERA — 오소그래픽 + 정면
    // ============================================================
    function setupCamera() {
        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );

        camera.setTarget(new BABYLON.Vector3(0, 0, 0));

        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        // 🔥 오소그래픽 영역 크게 — 화면 밖 문제 방지
        const orthoSize = 20;
        camera.orthoLeft   = -orthoSize;
        camera.orthoRight  =  orthoSize;
        camera.orthoTop    =  orthoSize;
        camera.orthoBottom = -orthoSize;

        camera.minZ = 0.1;
        camera.maxZ = 1000;

        // 디버그 카메라 출력
        console.log("[Camera] pos:", camera.position);
        console.log("[Camera] target:", camera.getTarget());
        console.log("[Camera] ortho:", camera.orthoLeft, camera.orthoRight, camera.orthoTop, camera.orthoBottom);
    }

    // ============================================================
    // BACKGROUND
    // ============================================================
    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
    }

    // ============================================================
    // LOAD NET
    // ============================================================
    FoldEngine.loadNet = function (net) {
        disposeAll();

        if (!net || !net.faces) return;

        facesSorted = net.faces.slice();

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();

        // 🔥 디버그: 원점 빨간점
        const debug = BABYLON.MeshBuilder.CreateSphere("debug", { diameter: 0.3 }, scene);
        const dbgMat = new BABYLON.StandardMaterial("dbgMat", scene);
        dbgMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
        dbgMat.disableLighting = true;
        debug.material = dbgMat;
        debug.position = new BABYLON.Vector3(0, 0, 0);

        console.log("[loadNet] Faces:", facesSorted);
    };

    // ============================================================
    // CLEANUP
    // ============================================================
    function disposeAll() {
        nodes.forEach(n => n.dispose && n.dispose());
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

        console.log("[computeNetCenter] netCenter =", netCenter);
    }

    // ============================================================
    // CREATE PLANES
    // ============================================================
    function createFaceMeshes() {
        const size = options.cellSize;
        nodes = [];

        facesSorted.forEach(face => {
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                {
                    size: size,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE // 🔥 양면 렌더링
                },
                scene
            );

            // material
            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            const c = BABYLON.Color3.FromHexString(face.color || "#999999");

            mat.emissiveColor = c; // 🔥 조명 영향 제거
            mat.disableLighting = true;
            mat.backFaceCulling = false; // 🔥 뒤집힘 방지

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            nodes.push(plane);
        });

        console.log("[createFaceMeshes] count:", nodes.length);
    }

    // ============================================================
    // POSITION PLANES
    // ============================================================
    function layoutFlat2D() {
        const size = options.cellSize;

        nodes.forEach((plane, i) => {
            const f = facesSorted[i];

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * size;
            const y = (netCenter.y - cy) * size;

            plane.position = new BABYLON.Vector3(x, y, 0);

            console.log(`[layout] face ${i}: pos=(${x}, ${y}) color=${f.color}`);
        });
    }

    // ============================================================
    // NO FOLDING — stubs
    // ============================================================
    FoldEngine.unfoldImmediate = function () { layoutFlat2D(); };
    FoldEngine.unfold = FoldEngine.unfoldImmediate;
    FoldEngine.reset = FoldEngine.unfoldImmediate;

    FoldEngine.foldImmediate = function () {};
    FoldEngine.foldTo = function () {};
    FoldEngine.foldStaticTo = function () {};
    FoldEngine.foldAnimate = async function () {};
    FoldEngine.showSolvedView = async function () {};

    FoldEngine.getFaceGroups = () => nodes;

    // ============================================================
    // RENDER LOOP
    // ============================================================
    function startRenderLoop() {
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = () => {
        if (engine) engine.resize();
    };

})();
