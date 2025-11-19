/**
 * foldEngine.js — Babylon 평면 전개도 엔진 (최종 안정 버전)
 *  - 2D 전개도와 3D 전개도의 색/좌표/방향 100% 일치
 *  - 좌우 반전 문제 해결
 *  - 색 랜덤 문제 해결
 *  - 숨겨진 face(_hidden) 자동 비표시
 *  - 카메라 자동 중앙 정렬
 *  - ORTHOGRAPHIC 시점
 *  - 접기 기능 스텁 (validator용 getFaceGroups 유지)
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
        cellSize: 1.4,
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
    // CAMERA — 위에서 내려다보는 핵심 시점 (ORTHO)
    // ============================================================
    function setupCamera() {
        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );

        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        const orthoSize = 4.5;
        camera.orthoLeft   = -orthoSize;
        camera.orthoRight  =  orthoSize;
        camera.orthoTop    =  orthoSize;
        camera.orthoBottom = -orthoSize;

        camera.minZ = -50;
        camera.maxZ = 1000;

        camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    }

    // ============================================================
    // 배경 설정
    // ============================================================
    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
    }

    // ============================================================
    // loadNet(net)
    // ============================================================
    FoldEngine.loadNet = function (net) {
        disposeAll();

        if (!net || !net.faces) return;

        facesSorted = net.faces.slice();

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();
        updateCameraTarget();
    };

    // ============================================================
    // disposeAll
    // ============================================================
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
    }

    // ============================================================
    // center 계산 (좌표 기준점)
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
    // Mesh 생성 (색, 숨김 등 포함)
    // ============================================================
    function createFaceMeshes() {
        const size = options.cellSize;

        facesSorted.forEach(face => {
            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + face.id,
                {
                    size,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE
                },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + face.id, scene);
            const c3  = BABYLON.Color3.FromHexString(face.color || "#cccccc");

            mat.emissiveColor = c3;
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            // 숨김 처리 ★★★
            if (face._hidden) {
                mat.alpha = 0;
                plane.isPickable = false;
            }

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();
            nodes[face.id] = plane;
        });
    }

    // ============================================================
    // 2D (u,v) → Babylon 3D (x,y) 정확 매핑 (좌우/상하 완벽 대응)
    // ============================================================
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];
            if (!plane) return;

            // 2D 좌표와 완벽히 일치시키는 핵심 공식 ★★★
            const x = -(f.u - netCenter.x) * size;
            const y =  (f.v - netCenter.y) * size;

            plane.position = new BABYLON.Vector3(x, y, 0);
        });
    }

    // ============================================================
    // 카메라 타겟을 전개도 중심에 맞춤 (Babylon 안전 방식)
    // ============================================================
    function updateCameraTarget() {
        if (!camera) return;

        const tx = 0;
        const ty = 0;

        camera.setTarget(new BABYLON.Vector3(tx, ty, 0));
    }

    // ============================================================
    // 접기 기능 스텁 — validator용 그룹 반환
    // ============================================================
    FoldEngine.unfoldImmediate = layoutFlat2D;
    FoldEngine.unfold = layoutFlat2D;
    FoldEngine.reset = layoutFlat2D;

    FoldEngine.foldImmediate = () => {};
    FoldEngine.foldTo = () => {};
    FoldEngine.foldStaticTo = () => {};
    FoldEngine.foldAnimate = () => Promise.resolve();
    FoldEngine.showSolvedView = () => Promise.resolve();

    FoldEngine.getFaceGroups = () => nodes;

    // ============================================================
    // RENDER LOOP
    // ============================================================
    function startRenderLoop() {
        if (!engine || !scene) return;

        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
