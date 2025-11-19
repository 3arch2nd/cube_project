/**
 * foldEngine.js — Babylon 평면 전개도 엔진
 *  - 2D 전개도와 3D 전개도의 색/좌표/방향 100% 일치
 *  - 좌우반전 문제 해결
 *  - 색 랜덤 배정 문제 해결 (face.id 기반 매핑)
 *  - FreeCamera + Ortho 시점 안정
 *  - 접기 기능은 스텁(validator 전용)
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

        if (babylonEngine && babylonScene) {
            engine = babylonEngine;
            scene = babylonScene;
        } else {
            engine = new BABYLON.Engine(canvas, true);
            scene = new BABYLON.Scene(engine);
        }

        setupCamera();
        setupEnvironment();
        startRenderLoop();
    };

    // ============================================================
    // CAMERA
    // ============================================================
    function setupCamera() {

        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );

        camera.setTarget(new BABYLON.Vector3(0, 0, 0));
        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        // 화면 비율 기준으로 ortho 크기 자동 조절
        const orthoSize = 5;
        camera.orthoLeft = -orthoSize;
        camera.orthoRight = orthoSize;
        camera.orthoTop = orthoSize;
        camera.orthoBottom = -orthoSize;

        camera.minZ = 0.1;
        camera.maxZ = 1000;
    }

    // ============================================================
    // ENV
    // ============================================================
    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
    }

    // ============================================================
    // PUBLIC: loadNet(net)
    // ============================================================
    FoldEngine.loadNet = async function (net) {
        disposeAll();

        if (!net || !net.faces) return;

        // face.id 순서 그대로 유지
        facesSorted = [...net.faces].sort((a, b) => a.id - b.id);

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();
    };

    // ------------------------------------------------------------
    // Dispose
    // ------------------------------------------------------------
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n?.dispose?.());
        }
        nodes = [];
    }

    // ============================================================
    // Center Calculation
    // ============================================================
    function computeNetCenter() {
        let minU = Infinity,
            maxU = -Infinity,
            minV = Infinity,
            maxV = -Infinity;

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
    // Create Planes
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
            const colorHex = face.color || "#888888";
            const c3 = BABYLON.Color3.FromHexString(colorHex);

            // 색 정확히 표현
            mat.emissiveColor = c3;         // 광원 영향 제거 후 색 유지
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            // 숨겨진 조각(겹침 모드) 투명 처리
            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            // id = index 매핑
            nodes[face.id] = plane;
        });
    }

    // ============================================================
    // Correct 2D → 3D Placement (좌우/상하 정확히 일치)
    // ============================================================
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];
            if (!plane) return;

            // 2D 중심
            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            // Babylon 좌표로 변환
            const x = (cx - netCenter.x) * size;   // 오른쪽 +
            const y = (cy - netCenter.y) * size;   // 아래일수록 값 증가

            // Babylon은 y축이 반대이므로 -y 사용 → 정확히 2D와 같은 배치
            plane.position = new BABYLON.Vector3(x, -y, 0);
        });
    }

    // ============================================================
    // Folding Stub (Validator 용)
    // ============================================================
    FoldEngine.unfoldImmediate = layoutFlat2D;
    FoldEngine.unfold = layoutFlat2D;
    FoldEngine.reset = layoutFlat2D;

    FoldEngine.foldImmediate = function () {};
    FoldEngine.foldTo = function () {};
    FoldEngine.foldStaticTo = function () {};
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

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
