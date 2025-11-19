/**
 * foldEngine.js — Babylon.js 기반 안정판
 * ---------------------------------------------------------------
 * - 왼쪽 2D 전개도와 같은 모양/색으로 3D 영역에 평면 표시
 * - 색상: face.id 기반 팔레트 매핑
 * - Plane 앞면이 카메라를 보도록 회전 → 어두운 뒷면 문제 해결
 * - 접기 관련 API는 스텁으로 제공 (main.js와 호환용)
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // Babylon 기본 레퍼런스
    // ------------------------------------------------------------
    let scene = null;
    let engine = null;
    let canvas = null;
    let camera = null;
    let light = null;

    // ------------------------------------------------------------
    // 전개도 데이터
    // ------------------------------------------------------------
    let facesSorted = [];
    let nodes = [];
    let netCenter = { x: 0, y: 0 };

    const options = {
        cubeSize: 1.0,
        faceOpacity: 0.95,
        backgroundColor: "#ffffff",
    };

    // ============================================================
    // PUBLIC: 초기화
    // ============================================================
    FoldEngine.init = function (canvasElement, babylonEngine, babylonScene) {
        canvas = canvasElement;
        engine = babylonEngine;
        scene = babylonScene;

        setupCameraAndLight();
        setupEnvironment();
        startRenderLoop();
    };

    // 옵션 바꾸고 싶을 때 쓸 수 있게 남겨둠
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

        // 정면에서 보는 ArcRotateCamera
        camera = new BABYLON.ArcRotateCamera(
    "camera",
    Math.PI / 2,      // 정면
    Math.PI / 3,      // 약간 위
    8,                // 거리
    new BABYLON.Vector3(0, 0, 0),
    scene
);
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 3;
        camera.upperRadiusLimit = 30;

        light = new BABYLON.HemisphericLight(
            "hemi",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
        light.intensity = 0.95;
    }

    // ============================================================
    // 환경 (배경)
    // ============================================================
    function setupEnvironment() {
        if (!scene) return;
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1.0);
    }

    // ============================================================
    // PUBLIC: net 로드 (main.js 에서 호출)
    // ============================================================
    FoldEngine.loadNet = function (net) {
        if (!net) return;
        FoldEngine.buildFromFaces(net.faces, net.adjacency, net.rootIndex || 0);
        FoldEngine.unfoldImmediate(); // 평면 상태로 표시
    };

    // ============================================================
    // PUBLIC: faces + adjacency 기반으로 3D 표시용 데이터 구성
    // (현재 버전에서는 adjacency는 사용하지 않음)
    // ============================================================
    FoldEngine.buildFromFaces = function (faces, adjFlat, rootIdx) {
        disposeAll();

        // id 순으로 정렬해 두면 안정적으로 색/순서를 유지할 수 있음
        facesSorted = faces.slice().sort((a, b) => a.id - b.id);

        computeNetCenter();
        createMeshes();
        layoutFlat2D();
    };

    // ------------------------------------------------------------
    // helper: 모든 mesh 제거
    // ------------------------------------------------------------
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => {
                if (n && n.dispose) n.dispose();
            });
        }
        nodes = [];
    }

    // ============================================================
    // Mesh 생성 (plane + 색상)
    // ============================================================
    function createMeshes() {
        nodes = [];
        const N = facesSorted.length;

        const PALETTE = [
            "#FFD54F", // 0: 노랑
            "#81C784", // 1: 연두
            "#64B5F6", // 2: 파랑
            "#BA68C8", // 3: 보라
            "#F48FB1", // 4: 분홍
            "#FF8A65"  // 5: 주황
        ];

        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + f.id,
                { size: options.cubeSize },
                scene
            );

            // 색상: face.id 기반
            const hex = PALETTE[f.id % PALETTE.length];

            const mat = new BABYLON.StandardMaterial("mat_" + f.id, scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(hex);
            mat.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(0.2); // 살짝 자발광 추가
            mat.alpha = options.faceOpacity;
            plane.material = mat;

            // Babylon 의 plane 기본 정면은 +Z 방향.
            // 카메라가 -Z 방향에서 바라보므로,
            // plane 을 Y축으로 180도 회전시켜 앞면이 카메라를 보도록 한다.
            plane.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                0,
                Math.PI,
                0
            );

            nodes.push(plane);
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
    // 2D 전개도 → 3D XY 평면으로 배치
    // ============================================================
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = cx - netCenter.x;
            const y = -(cy - netCenter.y); // 화면 y축 반전

            nodes[i].position = new BABYLON.Vector3(x, y, 0);
            // rotationQuaternion 은 createMeshes 에서 이미 설정됨 (정면)
        }
    }

    // ============================================================
    // PUBLIC: 평면 상태로 즉시 되돌리기 (main.js에서 사용)
    // ============================================================
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
    };

    // 접기 관련 API들은 일단 "동작은 안 하지만, 에러도 안 나는" 스텁으로 제공
    // main.js 의 Promise 체인과 호환되도록 Promise 반환

    // 즉시 특정 각도로 접기 (현재는 아무 것도 안 함)
    FoldEngine.foldImmediate = function (angleRad) {
        // TODO: Babylon 접기 애니메이션 구현 시 여기서 사용
        return;
    };

    // 애니메이션 접기 (현재는 단순히 시간만 기다리고 끝)
    FoldEngine.foldAnimate = function (durationSec) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, (durationSec || 0) * 1000);
        });
    };

    // 카메라를 "정답 뷰"로 이동 (현재는 아무 것도 안 하고 바로 resolve)
    FoldEngine.showSolvedView = function (durationSec) {
        return new Promise(resolve => {
            resolve();
        });
    };

    // 기타 호환용 메서드들 (실질 동작은 unfoldImmediate와 동일하게 처리)
    FoldEngine.foldTo = function (angleRad) {
        // TODO: 추후 구현
    };

    FoldEngine.unfold = function () {
        FoldEngine.unfoldImmediate();
    };

    FoldEngine.reset = function () {
        FoldEngine.unfoldImmediate();
    };

    FoldEngine.foldStaticTo = function (angleRad) {
        // validator/overlap에서 호출할 수 있으므로 남겨둠
        // 현재는 접기 없이 평면만 유지
    };

    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // ============================================================
    // 렌더 루프 / 리사이즈
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
