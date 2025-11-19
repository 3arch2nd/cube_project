/**
 * foldEngine.js — 2D 전개도와 1:1로 맞춘 Babylon "평면" 버전
 * ------------------------------------------------------------
 * - 2D 전개도와 모양/방향/색이 완전히 동일하게 보이도록만 구현
 * - 접기(fold) 관련 함수는 전부 스텁 (아무 동작 안 함, 에러도 안 냄)
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
    // PUBLIC: init(canvas)
    // main.js 에서 FoldEngine.init(threeCanvas) 식으로 호출됨
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
    // 카메라: 정면(앞에서 보는) 직교 카메라
    // X = 오른쪽, Y = 위
    // ============================================================
    function setupCamera() {
        // 카메라를 Z축 +쪽에서 원점을 향해 바라보게 함
        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );
        camera.setTarget(new BABYLON.Vector3(0, 0, 0));

        // 직교(orthographic) 모드 → 기울기/원근감 없음
        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        const orthoSize = 5;
        camera.orthoLeft   = -orthoSize;
        camera.orthoRight  =  orthoSize;
        camera.orthoTop    =  orthoSize;
        camera.orthoBottom = -orthoSize;

        camera.minZ = 0.1;
        camera.maxZ = 1000;
    }

    // ============================================================
    // 배경색만 설정 (조명 없음 = 색 안날아감)
    // ============================================================
    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1.0);
    }

    // ============================================================
    // PUBLIC: loadNet
    // net = { faces, adjacency, rootIndex }
    // ============================================================
    FoldEngine.loadNet = function (net) {
        if (!net || !net.faces) return;

        disposeAll();

        // faces 순서는 CubeNets가 준 그대로 사용 (색/배열 유지)
        facesSorted = net.faces.slice();

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();
    };

    // ------------------------------------------------------------
    // meshes 정리
    // ------------------------------------------------------------
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(m => m && m.dispose && m.dispose());
        }
        nodes = [];
    }

    // ============================================================
    // 중심 계산 (u, v 기준)
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
    // 면(plane) 생성 — 카메라 정면을 바라보는 평면
    // ============================================================
    function createFaceMeshes() {
        nodes = [];

        const size = options.cellSize;

        facesSorted.forEach(face => {
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                { size: size },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);

            const hex = face.color || "#cccccc";
            const c3  = BABYLON.Color3.FromHexString(hex);

            // 조명 영향 없이 깔끔한 색을 위해 emissive만 사용
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.emissiveColor = c3;
            mat.disableLighting = true;

            plane.material = mat;

            // 카메라를 정면에서 보고 있으므로 별도 회전 필요 없음
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            nodes.push(plane);
        });
    }

    // ============================================================
    // 2D 전개도(u,v) → 3D 위치(x,y)
    //  - u 증가: 오른쪽 → x 증가
    //  - v 증가: 아래쪽 → y 감소  (그래서 부호 반전)
    // ============================================================
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach((f, i) => {
            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * size;
            const y = (netCenter.y - cy) * size;   // ⬅ v 증가가 아래이므로 부호 반전

            nodes[i].position = new BABYLON.Vector3(x, y, 0);
        });
    }

    // ============================================================
    // PUBLIC: unfold / reset (지금은 전개도 평면만 유지)
    // ============================================================
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
    };
    FoldEngine.unfold = FoldEngine.unfoldImmediate;
    FoldEngine.reset = FoldEngine.unfoldImmediate;

    // 접기 관련 API들: main.js Promise 체인 호환용 스텁
    FoldEngine.foldImmediate = function () {};
    FoldEngine.foldTo = function () {};
    FoldEngine.foldStaticTo = function () {};
    FoldEngine.foldAnimate = function (t) { return Promise.resolve(); };
    FoldEngine.showSolvedView = function (t) { return Promise.resolve(); };

    FoldEngine.getFaceGroups = function () { return nodes; };

    // ============================================================
    // render loop / resize
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
