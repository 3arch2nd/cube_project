/**
 * foldEngine.js — Babylon.js 기반 안정판 (전개도 평면 표시 + 색상 정상화)
 * ---------------------------------------------------------------
 * 1) 2D 전개도 → 3D 평면으로 정확하게 표시
 * 2) 색상 정상 출력
 * 3) 각 면이 올바르게 한 평면에 붙어서 보임
 * 4) parent/hinge/접기 기능은 비활성화 (향후 구현 가능)
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene = null;
    let engine = null;
    let canvas = null;
    let camera = null;
    let light = null;

    let nodes = [];
    let facesSorted = [];
    let adjacency = [];
    let netCenter = { x: 0, y: 0 };

    const options = {
        cubeSize: 1.0,
        faceOpacity: 0.95,
        backgroundColor: "#ffffff",
    };

    // ============================================================
    // PUBLIC: 초기화
    // ============================================================
    FoldEngine.init = function (canvasElement, _engine, _scene) {
        canvas = canvasElement;
        engine = _engine;
        scene = _scene;

        setupCameraAndLight();
        setupEnvironment();
        startRenderLoop();
    };

    // ============================================================
    // 카메라 / 조명
    // ============================================================
    function setupCameraAndLight() {
        if (!scene) return;

        camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI / 4,
            Math.PI / 4,
            8,
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
        light.intensity = 0.9;
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
    // faces 데이터 정렬 + adjacency 변환 + mesh 생성
    // ============================================================
    FoldEngine.buildFromFaces = function (faces, adjFlat, rootIdx) {
        disposeAll();

        // faces 배열을 face.id 기준으로 정렬
        facesSorted = faces.slice().sort((a, b) => a.id - b.id);

        adjacency = convertAdjacency(facesSorted, adjFlat);

        computeNetCenter();
        createMeshes();
        layoutFlat2D();
    };

    // ============================================================
    // adjacency 변환 (안전판)
    // ============================================================
    function convertAdjacency(faces, adjFlat) {
        const validIds = new Set(faces.map(f => f.id));

        const idToIndex = {};
        faces.forEach((f, i) => (idToIndex[f.id] = i));

        const result = Array.from({ length: faces.length }, () => []);

        const dirToEdge = {
            up: 2,
            down: 0,
            left: 1,
            right: 3,
        };

        adjFlat.forEach(a => {
            const { from, to, dir } = a;
            if (!dir) return;
            if (!validIds.has(from) || !validIds.has(to)) return;

            const iFrom = idToIndex[from];
            const iTo = idToIndex[to];

            const edgeA = dirToEdge[dir] ?? 0;

            result[iFrom].push({
                to: iTo,
                edgeA,
                edgeB: edgeA,
            });
        });

        return result;
    }

    // ============================================================
    // Mesh 생성
    // ============================================================
    function createMeshes() {
        nodes = [];
        const N = facesSorted.length;

        const PALETTE = [
            "#FFD54F", // yellow
            "#81C784", // green
            "#64B5F6", // blue
            "#BA68C8", // purple
            "#F48FB1", // pink
            "#FF8A65", // orange
        ];

        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + f.id,
                { size: options.cubeSize },
                scene
            );

            // 색상 매핑: face.id 기반
            const hex = PALETTE[f.id % PALETTE.length];

            const mat = new BABYLON.StandardMaterial("mat_" + f.id, scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(hex);
            mat.alpha = options.faceOpacity;

            plane.material = mat;
            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            nodes.push(plane);
        }
    }

    // ============================================================
    // 전개도 중심 계산
    // ============================================================
    function computeNetCenter() {
        let minU = 999, maxU = -999;
        let minV = 999, maxV = -999;

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
    // 2D 배치를 XY 평면으로 그리기
    // ============================================================
    function layoutFlat2D() {
        const N = facesSorted.length;

        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = cx - netCenter.x;
            const y = -(cy - netCenter.y); // y축 반전

            nodes[i].rotationQuaternion = BABYLON.Quaternion.Identity();
            nodes[i].position = new BABYLON.Vector3(x, y, 0);
        }
    }

    // ============================================================
    // 렌더 루프
    // ============================================================
    function startRenderLoop() {
        if (!engine || !scene) return;

        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    // ============================================================
    // 정리
    // ============================================================
    function disposeAll() {
        nodes.forEach(n => n.dispose());
        nodes = [];
    }

    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
    };

    FoldEngine.loadNet = function (net) {
        if (!net) return;

        FoldEngine.buildFromFaces(net.faces, net.adjacency, net.rootIndex || 0);

        FoldEngine.unfoldImmediate();
    };

    FoldEngine.onResize = function () {
        if (engine) engine.resize();
    };

})();
