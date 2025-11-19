/**
 * foldEngine.js — 2D 전개도와 1:1로 맞춘 Babylon 평면 버전 (색·위치·방향 일치용)
 * - 접기 애니메이션은 아직 없음 (호환용 스텁만 존재)
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

        const orthoSize = 4; // 전개도 전체가 적당히 보이도록
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

        // CubeNets가 준 순서를 그대로 씀 (id와 color가 이미 맞음)
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
    // CREATE PLANES (색 1:1 적용)
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

            mat.emissiveColor = c3;               // 조명 영향 X, 색 그대로
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            plane.material = mat;

            // ※ 회전은 일단 0 (정면)
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            // id를 인덱스로 그대로 사용 (빠진 face가 있어도 안전)
            nodes[face.id] = plane;
        });
    }

    // ============================================================
    // 2D (u,v) → 3D (x,y) 배치
    //
    //  - 2D:  u 증가 → 오른쪽, v 증가 → 아래
    //  - 3D:  x 증가 → 왼쪽(고의로 반전), y 증가 → 위
    //
    //  => x 에서 netCenter.x - cx 로 좌우 반전을 한 번 더 줘서
    //     현재 “좌우 뒤집혀 보이는 문제”를 보정
    // ============================================================
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];
            if (!plane) return;

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            // ★ 좌우 반전 보정: netCenter.x - cx
            const x = (netCenter.x - cx) * size;
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
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
