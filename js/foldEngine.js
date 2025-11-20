/************************************************************
 * foldEngine.js — 안정 평면 버전 + 슬라이더/검증용 API
 *  - 2D 전개도와 3D 전개도의 색/좌표/방향 100% 일치
 *  - 좌우/상하 반전 없음
 *  - face.color 그대로 사용 (랜덤 색 없음)
 *  - ArcRotateCamera (마우스로 회전 가능)
 *  - fold/unfold 관련 함수들은 일단 "평면 상태 유지"용 스텁
 *    → 나중에 여기서 실제 힌지 회전 로직만 추가하면 됨
 ************************************************************/

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let canvas = null;
    let engine = null;
    let scene = null;
    let camera = null;

    let facesSorted = [];         // net.faces 복사 (id 기준 정렬)
    let nodes = [];               // face.id → BABYLON.Mesh(Plane)
    let netCenter = { x: 0, y: 0 };

    const options = {
        cellSize: 1.0,
        backgroundColor: "#ffffff"
    };

    // 슬라이더용 진행도(0=완전 펼침, 1=완전 접힘)
    let foldProgress = 0;

    /************************************************************
     * INIT
     ************************************************************/
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
        // ArcRotateCamera: 기본은 위에서 약간 비스듬히 내려다보는 시점
        camera = new BABYLON.ArcRotateCamera(
            "cubeCam",
            -Math.PI / 2,    // x축 방향에서 시작
            Math.PI / 3,     // 위쪽에서 내려다보는 각도
            8,               // 반지름(줌 거리)
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);

        camera.lowerRadiusLimit = 4;
        camera.upperRadiusLimit = 20;
        camera.wheelPrecision = 50;
    }

    function setupEnvironment() {
        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);

        // 약한 헤미스페릭 라이트 (emissiveColor 때문에 사실 없어도 되지만 예비용)
        const light = new BABYLON.HemisphericLight(
            "hemi",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
        light.intensity = 0.6;
    }

    /************************************************************
     * PUBLIC: loadNet(net)
     *   - net.faces: {id,u,v,w,h,color,_hidden?}[]
     ************************************************************/
    FoldEngine.loadNet = function (net) {
        disposeAll();

        if (!net || !Array.isArray(net.faces)) return;

        // id 기준 정렬(0~5)
        facesSorted = net.faces.slice().sort((a, b) => a.id - b.id);

        computeNetCenter();
        createFaceMeshes();
        layoutFlat2D();          // 항상 "완전 펼쳐진 상태"로 배치
        setFoldProgress(0);      // 슬라이더 값도 0으로 가정
    };

    /************************************************************
     * 내부: 모든 기존 메쉬 제거
     ************************************************************/
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(n => {
                if (n && n.dispose) n.dispose();
            });
        }
        nodes = [];
        facesSorted = [];
    }

    /************************************************************
     * 전개도 중심 계산 (u,v 기준 bounding box)
     ************************************************************/
    function computeNetCenter() {
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

    /************************************************************
     * 각 face.id마다 Plane 생성 (색/숨김 처리)
     ************************************************************/
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
            const hex = face.color || "#888888";
            const c3 = BABYLON.Color3.FromHexString(hex);

            // 조명에 영향 안 받도록 emissiveColor 사용
            mat.emissiveColor = c3;
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;

            // 2D에서 숨겼던 조각은 3D에서도 투명 처리
            if (face._hidden) {
                mat.alpha = 0.0;
                plane.isPickable = false;
            }

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            nodes[face.id] = plane;
        });
    }

    /************************************************************
     * 2D (u,v) → 3D (x,y) 매핑
     *  - 2D와 좌우/상하가 그대로 맞도록 설계
     *  - netCenter를 기준으로 중앙 정렬
     ************************************************************/
    function layoutFlat2D() {
        const size = options.cellSize;

        facesSorted.forEach(f => {
            const plane = nodes[f.id];
            if (!plane) return;

            // (u,v)의 중앙 좌표
            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            // x: 오른쪽이 +, y: 위쪽이 +  (2D와 동일하게 보이도록)
            const x = (cx - netCenter.x) * size;
            const y = (netCenter.y - cy) * size;

            plane.position = new BABYLON.Vector3(x, y, 0);
            // 평면 상태이므로 회전 없음
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();
        });

        // 카메라도 항상 전개도 중심을 바라보게
        if (camera) {
            camera.target = new BABYLON.Vector3(0, 0, 0);
        }
    }

    /************************************************************
     * 슬라이더용 foldProgress 제어
     *  - 지금은 "평면 상태 유지"만 함
     *  - 나중에 여기에서 실제 힌지 회전 로직만 추가하면 됨
     ************************************************************/
    function setFoldProgress(value) {
        foldProgress = Math.max(0, Math.min(1, value));

        // 🔹 현재 버전: 항상 평면 상태로 유지
        //   (차후: 여기에서 foldProgress에 따라 face.rotationQuaternion 수정)
        layoutFlat2D();
    }

    FoldEngine.setFoldProgress = setFoldProgress;

    /************************************************************
     * 기존 main.js / validator.js 가 기대하는 API들 (스텁)
     ************************************************************/
    // 0으로 펼치기
    FoldEngine.unfoldImmediate = function () {
        setFoldProgress(0);
    };

    // 1로 완전히 접기 (현재는 평면 그대로, 추후 구현)
    FoldEngine.foldImmediate = function () {
        setFoldProgress(1);
    };

    // 0~1로 바로 세팅
    FoldEngine.foldTo = function (t) {
        setFoldProgress(t);
    };

    // 라디안 각도(0~π/2)를 받아 foldProgress 추정
    FoldEngine.foldStaticTo = function (angleRad) {
        const t = Math.max(0, Math.min(1, angleRad / (Math.PI / 2)));
        setFoldProgress(t);
    };

    // 애니메이션 버전 (지금은 그냥 즉시 완료)
    FoldEngine.foldAnimate = function (durationSec) {
        // 나중에 requestAnimationFrame으로 부드럽게 바꾸면 됨
        setFoldProgress(1);
        return Promise.resolve();
    };

    FoldEngine.showSolvedView = function (durationSec) {
        // 여기서 카메라 각도/거리 살짝 바꿔줄 수도 있음
        return Promise.resolve();
    };

    // validator용(현재 THREE 기반 validator는 이미 깨진 상태지만, 인터페이스는 유지)
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    /************************************************************
     * RENDER LOOP / RESIZE
     ************************************************************/
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
