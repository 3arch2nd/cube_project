/**
 * foldEngine.js — Babylon 평면 전개도 엔진 (최종 단순/안정 버전)
 *  - 2D 전개도와 3D 전개도의 색/좌표/방향 100% 일치
 *  - 좌우반전 문제 제거
 *  - 색 랜덤 배정 문제 제거 (face.color 사용)
 *  - FreeCamera + ORTHO 시점, 적당한 스케일
 *  - 접기 기능은 전부 스텁 (validator용으로만 getFaceGroups 제공)
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    // 현재 전개도
    let facesSorted = [];   // net.faces 를 그대로 복사 (id 순 정렬)
    let nodes = [];         // 각 face.id 에 대응하는 Plane Mesh
    let netCenter = { x: 0, y: 0 }; // 필요하면 쓸 수 있지만, 지금은 안 써도 됨

    const options = {
        cellSize: 1.0,
        backgroundColor: "#ffffff"
    };

    // ============================================================
    // INIT
    // ============================================================
    FoldEngine.init = function (canvasElement, babylonEngine, babylonScene) {
        canvas = canvasElement;

        // main.js 에서 engine/scene 을 넘겨주면 그걸 사용
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

    // ------------------------------------------------------------
    // CAMERA (위에서 내려다보는 정사각형 시점)
    // ------------------------------------------------------------
    function setupCamera() {
        camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, 10),
            scene
        );

        camera.setTarget(new BABYLON.Vector3(0, 0, 0));
        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

        // 정육면체 전개도가 4×4 격자 안에 들어오니까, 3 정도면 화면에 꽉 찬 느낌
        const orthoSize = 3;
        camera.orthoLeft   = -orthoSize;
        camera.orthoRight  =  orthoSize;
        camera.orthoTop    =  orthoSize;
        camera.orthoBottom = -orthoSize;

        camera.minZ = 0.1;
        camera.maxZ = 1000;
    }

    // ------------------------------------------------------------
    // 배경색
    // ------------------------------------------------------------
    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);
    }

    // ============================================================
    // PUBLIC: loadNet(net)
    //   - net.faces: {id,u,v,w,h,color,_hidden?}[]
    // ============================================================
    FoldEngine.loadNet = async function (net) {
        disposeAll();

        if (!net || !Array.isArray(net.faces)) return;

        // face.id 기준 정렬 (0~5)
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        computeNetBounds();
        createFaceMeshes();
        layoutFlat2D();
    };

    // ------------------------------------------------------------
    // 모든 Plane 제거
    // ------------------------------------------------------------
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => n && n.dispose && n.dispose());
        }
        nodes = [];
    }

    // ------------------------------------------------------------
    // 전개도 전체 bounds (지금은 center 안 쓰지만 혹시를 위해 계산)
    // ------------------------------------------------------------
    function computeNetBounds() {
        if (!facesSorted.length) return;

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
    // 각 face.id 에 대응하는 Plane Mesh 생성
    // ------------------------------------------------------------
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

            // 조명 영향 없이 색만 보이게
            mat.emissiveColor = c3;
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            // face.id 를 index 로 그대로 사용
            nodes[face.id] = plane;
        });
    }

    // ------------------------------------------------------------
    // 2D (u,v) → 3D (x,y) 매핑
    //   ★ 여기에서 좌우/상하가 2D와 100% 동일하도록 단순 매핑
    // ------------------------------------------------------------
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];
            if (!plane) return;

            // 2D 좌표 그대로 사용 (중심 정렬 말고 “모양/방향” 일치가 목표)
            const x = f.u * size;      // 오른쪽으로 갈수록 +
            const y = f.v * size;      // 아래로 갈수록 + (2D 기준)

            // Babylon 은 위가 +Y 이므로 부호만 한 번 뒤집어 줌
            plane.position = new BABYLON.Vector3(x, -y, 0);
        });
    }

    // ============================================================
    // 접기 관련 함수들 (현재는 스텁)
    // ============================================================
    FoldEngine.unfoldImmediate = layoutFlat2D;
    FoldEngine.unfold = layoutFlat2D;
    FoldEngine.reset = layoutFlat2D;

    FoldEngine.foldImmediate = function () {};
    FoldEngine.foldTo = function () {};
    FoldEngine.foldStaticTo = function () {};
    FoldEngine.foldAnimate = function () { return Promise.resolve(); };
    FoldEngine.showSolvedView = function () { return Promise.resolve(); };

    // validator 가 쓰는 인터페이스
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // ============================================================
    // RENDER LOOP
    // ============================================================
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(function () {
            scene.render();
        });
    }

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
