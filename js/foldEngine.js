/**
 * foldEngine.js — 2D 전개도와 1:1로 맞춘 Babylon 평면 버전 (최종)
 * ------------------------------------------------------------
 * - 2D 전개도와 모양/방향/색이 완전히 동일하게 보이도록만 구현
 * - 접기 관련 함수는 스텁 (main.js와 호환용)
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
        cellSize: 1.0,          // 2D 한 칸 = 1.0
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
    // CAMERA — 정면, 직교, 보기 좋은 크기
    // ============================================================
    function setupCamera() {
        // Z=+10에서 원점을 향해 정면으로 보는 카메라
        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );
        camera.setTarget(new BABYLON.Vector3(0, 0, 0));

        // 직교(orthographic) 모드 → 기울기/원근감 없음, 완전 2D 느낌
        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        // 전개도는 좌표가 대략 -2 ~ +2 사이이므로 여유 있게 4로 설정
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

        // faces 순서는 CubeNets가 준 그대로 사용 (색/배열 유지)
        facesSorted = net.faces.slice();

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();
    };

    // ============================================================
    // CLEANUP
    // ============================================================
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
    }

    // ============================================================
    // CENTER (u, v 기준)
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
    // 면 생성 (카메라 정면을 보는 평면)
    // ============================================================
    function createFaceMeshes() {
        const size = options.cellSize;
        nodes = [];

        facesSorted.forEach(face => {
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                {
                    size: size,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE // 앞/뒤 모두 보이게
                },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);

            const hex = face.color || "#cccccc";
            const c3  = BABYLON.Color3.FromHexString(hex);

            // 조명 없이 색만 또렷하게
            mat.emissiveColor = c3;
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            nodes.push(plane);
        });
    }

    // ============================================================
    // 2D 전개도(u,v) → 3D (x,y) 배치
    //
    //  - 2D:  u 증가 → 오른쪽
    //         v 증가 → 아래쪽
    //
    //  - 3D:  x 증가 → 오른쪽
    //         y 증가 → 위쪽
    //
    //  => y = (netCenter.y - cy) 로 두어
    //     v 증가(아래) → y 감소(아래) 가 되도록 매핑
    // ============================================================
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach((f, i) => {
            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * size;
            const y = (netCenter.y - cy) * size;

            nodes[i].position = new BABYLON.Vector3(x, y, 0);
        });
    }

    // ============================================================
    // PUBLIC: unfold / reset (지금은 평면만 유지)
    // ============================================================
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
    };
    FoldEngine.unfold = FoldEngine.unfoldImmediate;
    FoldEngine.reset = FoldEngine.unfoldImmediate;

    // 접기 관련 스텁 (main.js에서 호출해도 에러 안 나게)
    FoldEngine.foldImmediate = function () {};
    FoldEngine.foldTo = function () {};
    FoldEngine.foldStaticTo = function () {};
    FoldEngine.foldAnimate = function () { return Promise.resolve(); };
    FoldEngine.showSolvedView = function () { return Promise.resolve(); };

    FoldEngine.getFaceGroups = function () { return nodes; };

    // ============================================================
    // RENDER LOOP
    // ============================================================
    function startRenderLoop() {
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
