/**
 * foldEngine.js — Babylon.js 평면 전개도 표시 안정판
 * --------------------------------------------------
 * - 2D 전개도와 동일한 배열/색으로 3D 캔버스에 표시
 * - 접기(fold) 관련 함수는 아직 스텁(Promise) 처리
 * - main.js에서 사용하는 API 시그니처 유지
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // Babylon 객체
    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;
    let light = null;

    // 전개도 데이터
    let facesSorted = [];
    let adjacency = [];
    let nodes = [];
    let netCenter = { x: 0, y: 0 };

    const options = {
        cellSize: 1.0,       // 한 칸 크기
        faceOpacity: 0.95,
        backgroundColor: "#ffffff"
    };

    // ============================================================
    // PUBLIC: 초기화
    //  main.js에서 FoldEngine.init(threeCanvas) 형태로 호출
    // ============================================================
    FoldEngine.init = function (canvasElement) {
        canvas = canvasElement;

        // Babylon 엔진/씬 생성
        engine = new BABYLON.Engine(canvas, true);
        scene = new BABYLON.Scene(engine);

        setupCameraAndLight();
        setupEnvironment();
        startRenderLoop();
    };

    // 옵션 변경(필요시)
    FoldEngine.setOptions = function (opt) {
        Object.assign(options, opt || {});
        if (scene) {
            const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
            scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1.0);
        }
    };

    // ============================================================
    // 카메라 / 조명
    // ============================================================
    function setupCameraAndLight() {
        if (!scene) return;

        // 위에서 약간 비스듬히 내려다보는 ArcRotateCamera
        camera = new BABYLON.ArcRotateCamera(
            "camera",
            Math.PI / 2,      // alpha : +X 방향에서
            Math.PI / 3,      // beta  : 위에서 60도 정도 내려다보기
            8,                // radius: 거리
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 3;
        camera.upperRadiusLimit = 20;

        light = new BABYLON.HemisphericLight(
            "hemi",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
        light.intensity = 0.95;
    }

    // 배경색 등 환경 설정
    function setupEnvironment() {
        if (!scene) return;
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1.0);
    }

    // ============================================================
    // PUBLIC: loadNet (main.js에서 호출)
    // net: { faces, adjacency, rootIndex } 구조
    // ============================================================
    FoldEngine.loadNet = function (net) {
        if (!net) return;

        buildFromFaces(net.faces, net.adjacency || [], net.rootIndex || 0);
        FoldEngine.unfoldImmediate();   // 평면 상태로 표시
    };

    // ============================================================
    // 내부: faces / adjacency로부터 3D용 데이터 구성
    // (접기 애니메이션은 아직 사용 X, adjacency는 보관만)
    // ============================================================
    function buildFromFaces(faces, adjFlat, rootIdx) {
        disposeAll();

        // id 순으로 정렬해 두면 색/좌표 일관성 유지
        facesSorted = faces.slice().sort((a, b) => a.id - b.id);
        adjacency = adjFlat || [];

        computeNetCenter();
        createAllFaceMeshes();
        layoutFlat2D();
    }

    // mesh 정리
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(m => m && m.dispose && m.dispose());
        }
        nodes = [];
    }

    // ============================================================
    // 면(mesh) 생성 — CreateGround 사용해서 위쪽을 향하도록 함
    // ============================================================
    function createAllFaceMeshes() {
        nodes = [];
        const N = facesSorted.length;
        const size = options.cellSize;

        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];

            const ground = BABYLON.MeshBuilder.CreateGround(
                "face_" + f.id,
                { width: size, height: size },
                scene
            );

            const mat = new BABYLON.StandardMaterial("mat_" + f.id, scene);

            // 색상: CubeNets가 넣어준 face.color 우선 사용
            let hex = "#cccccc";
            if (typeof f.color === "string") {
                hex = f.color;
            }

            const c3 = BABYLON.Color3.FromHexString(hex);
            mat.diffuseColor = c3;
            mat.emissiveColor = c3.scale(0.25); // 살짝 밝게
            mat.alpha = options.faceOpacity;
            ground.material = mat;

            // CreateGround는 기본적으로 위(+Y)쪽을 향하므로
            // 따로 회전은 필요 없음.
            nodes.push(ground);
        }
    }

    // ============================================================
    // 전개도 중심 계산
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
    // 2D 전개도 → XZ 평면으로 평면 배치
    //
    //  - 2D u → X
    //  - 2D v → Z (아래로 갈수록 +Z)
    //  - 카메라는 위(+Y)에서 내려다보므로,
    //    왼쪽 전개도와 거의 같은 느낌으로 보임
    // ============================================================
    function layoutFlat2D() {
        const N = facesSorted.length;
        const size = options.cellSize;

        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = (cx - netCenter.x) * size;
            const z = (cy - netCenter.y) * size;

            nodes[i].position = new BABYLON.Vector3(x, 0, z);
        }
    }

    // ============================================================
    // PUBLIC: 평면 상태로 즉시 적용
    // ============================================================
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
    };

    // 이하 fold 관련 API는 아직 스텁으로 두되,
    // main.js 의 Promise 체인과 호환되도록 구현

    // 접기 애니메이션 (현재는 아무 것도 안 하고 바로 resolve)
    FoldEngine.foldAnimate = function (durationSec) {
        return new Promise(resolve => {
            // 나중에 종이접기 애니메이션을 여기서 구현할 수 있음
            resolve();
        });
    };

    // 정답 뷰 (현재는 카메라 위치 살짝 조정만 하고 바로 resolve)
    FoldEngine.showSolvedView = function (durationSec) {
        return new Promise(resolve => {
            // 필요하다면 여기서 카메라 target/zoom 조절
            resolve();
        });
    };

    // 기타 호환용 함수들 (실제 동작은 평면 상태 유지)
    FoldEngine.foldImmediate = function (angleRad) {
        // 아직 접기 구현 없음
    };

    FoldEngine.foldTo = function (angleRad) {
        // 아직 접기 구현 없음
    };

    FoldEngine.unfold = function () {
        FoldEngine.unfoldImmediate();
    };

    FoldEngine.reset = function () {
        FoldEngine.unfoldImmediate();
    };

    FoldEngine.foldStaticTo = function (angleRad) {
        // validator/overlap 에서 호출할 수 있으므로 정의만 해 둠
    };

    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // ============================================================
    // 렌더 루프 / 리사이즈
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
