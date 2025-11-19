/**
 * foldEngine.js — Babylon 평면 전개도 엔진 (2D와 1:1 매칭)
 *  - 색 / 위치 / 방향만 맞추는 버전 (접기 애니메이션은 스텁)
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
    // INIT: main.js에서 엔진/씬을 넘겨줄 수 있도록 설계
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

    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
    }

    // ============================================================
    // PUBLIC: loadNet(net)
    //  - net.faces: {id,u,v,w,h,color,_hidden?}[]
    // ============================================================
    FoldEngine.loadNet = function (net) {
        disposeAll();

        if (!net || !net.faces) return;

        facesSorted = net.faces.slice(); // 순서 유지

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();
    };

    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
    }

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

            // 숨김 플래그(_hidden)인 경우 투명 처리
            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            // id를 index로 그대로 사용
            nodes[face.id] = plane;
        });
    }

    // 2D (u,v) → 3D (x,y) 매핑 (좌우/상하 그대로)
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];
            if (!plane) return;

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * size;      // 오른쪽 +
            const y = (netCenter.y - cy) * size;      // 아래로 갈수록 y 감소

            plane.position = new BABYLON.Vector3(x, y, 0);
        });
    }

    // ============================================================
    // 접기 관련 함수들: 현재는 "아무것도 안 하는 스텁"
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
    // RENDER LOOP / RESIZE
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
