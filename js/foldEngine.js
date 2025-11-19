/**
 * foldEngine.js – ⭐ Babylon.js 최종 안정화 버전 ⭐
 * ------------------------------------------------------------
 * - adjacency 변환(flat → face별 리스트)
 * - 색상 체계 정리
 * - parentTree / hinge / folding 정상화
 * - layoutFlat2D 정상 작동
 * - loadNet(main.js 호환)
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // Babylon 기본
    // ------------------------------------------------------------
    let scene = null;
    let engine = null;
    let canvas = null;
    let camera = null;
    let light = null;
    let gridMesh = null;
let groundMesh = null;

    // ------------------------------------------------------------
    // 상태 데이터
    // ------------------------------------------------------------
    let facesSorted = [];
    let nodes = [];
    let adjacency = [];
    let parentIndex = [];
    let hingeInfo = [];
    let rootIndex = 0;

    let currentAngle = 0;
    let targetAngle = 0;
    let folding = false;
    let foldSpeed = 0.03;

    let netCenter = { x: 0, y: 0 };

    let options = {
        cubeSize: 1.0,
        faceOpacity: 0.9,
        showGrid: true,
        backgroundColor: "#ffffff",
    };

    const Y_OFFSET_STEP = 0.0;

    // ============================================================
    // PUBLIC: 초기화
    // ============================================================
    FoldEngine.init = function (canvasElement, babylonEngine, babylonScene) {
        canvas = canvasElement;
        engine = babylonEngine;
        scene = babylonScene;

        setupCameraAndLight();
        setupEnvironment();
        startBaseLoop();
    };

    // ============================================================
    // 카메라 / 조명
    // ============================================================
    function setupCameraAndLight() {
        if (!scene) return;

        const radius = 6;
        const alpha = -Math.PI / 4;
        const beta = Math.PI / 4;

        camera = new BABYLON.ArcRotateCamera(
            "camera",
            alpha,
            beta,
            radius,
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);

        camera.lowerRadiusLimit = 2;
        camera.upperRadiusLimit = 20;
        camera.wheelDeltaPercentage = 0.01;

        light = new BABYLON.HemisphericLight(
            "light",
            new BABYLON.Vector3(0, 1, 0),
            scene
        );
        light.intensity = 0.9;
    }

    // ============================================================
    // 환경
    // ============================================================
    function setupEnvironment() {
        if (!scene) return;

        const bg = BABYLON.Color3.FromHexString(options.backgroundColor);
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1);

        if (options.showGrid) {
            const size = 6;
            gridMesh = BABYLON.MeshBuilder.CreateGround(
                "grid",
                { width: size, height: size, subdivisions: 12 },
                scene
            );
            const gridMat = new BABYLON.StandardMaterial("gridMat", scene);
            gridMat.wireframe = true;
            gridMat.alpha = 0.15;
            gridMesh.material = gridMat;
            gridMesh.position.y = -0.51;
        }
    }

    FoldEngine.setOptions = function (opt) {
        options = Object.assign({}, options, opt);
    };

    // ============================================================
    // ⭐ adjacency 변환 핵심 함수 ⭐
    // flat list → face별 배열로 재구성
    // ============================================================
    function convertAdjacency(faces, adjFlat) {
        const N = faces.length;
        const result = Array.from({ length: N }, () => []);

        if (!Array.isArray(adjFlat)) return result;

        adjFlat.forEach(a => {
            if (typeof a.from !== "number" || typeof a.to !== "number") return;

            // from → to
            result[a.from].push({
                to: a.to,
                edgeA: a.edgeA ?? 0,
                edgeB: a.edgeB ?? 0
            });

            // to → from (양방향)
            result[a.to].push({
                to: a.from,
                edgeA: a.edgeB ?? 0,
                edgeB: a.edgeA ?? 0
            });
        });

        return result;
    }

    // ============================================================
    // PUBLIC: faces + adjacency 기반으로 mesh 생성
    // ============================================================
    FoldEngine.buildFromFaces = function (faces, adjFlat, rootIdx) {
        disposeAll();

        facesSorted = faces.slice();
        rootIndex = rootIdx || 0;

        // ⭐ adjacency 변환 적용 ⭐
        adjacency = convertAdjacency(facesSorted, adjFlat);

        computeNetCenter();
        createAllFacesMeshes();
        buildParentTree();
        buildHingeInfo();

        layoutFlat2D();

        currentAngle = 0;
        targetAngle = 0;
        folding = false;
    };

    // ============================================================
    // Mesh 정리
    // ============================================================
    function disposeAll() {
        if (nodes) nodes.forEach(n => n.dispose?.());
        nodes = [];
    }

    // ============================================================
    // ⭐ 면 Mesh 생성 – 색상/초기 회전 등 정상화 ⭐
    // ============================================================
    function createAllFacesMeshes() {
        nodes = [];
        const size = options.cubeSize;

        const COLOR_PALETTE = [
            "#FFD54F", "#64B5F6", "#81C784",
            "#BA68C8", "#F48FB1", "#FF8A65"
        ];

        for (let i = 0; i < facesSorted.length; i++) {
            const face = facesSorted[i];

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + i,
                { size },
                scene
            );

            // 색상
            let hex = "#cccccc";
            if (typeof face.color === "string") hex = face.color;
            else if (typeof face.color === "number")
                hex = COLOR_PALETTE[face.color % COLOR_PALETTE.length];

            const mat = new BABYLON.StandardMaterial("mat_" + i, scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(hex);
            mat.alpha = options.faceOpacity;
            plane.material = mat;

            plane.rotationQuaternion = BABYLON.Quaternion.Identity();
            plane.metadata = { faceIndex: i };

            nodes.push(plane);
        }
    }

    // ============================================================
    // Parent Tree 구성
    // ============================================================
    function buildParentTree() {
        const N = facesSorted.length;
        parentIndex = Array(N).fill(-1);
        parentIndex[rootIndex] = null;

        const visited = Array(N).fill(false);
        visited[rootIndex] = true;

        const q = [rootIndex];

        while (q.length > 0) {
            const p = q.shift();
            const neigh = adjacency[p] || [];

            neigh.forEach(n => {
                const to = n.to;
                if (!visited[to]) {
                    visited[to] = true;
                    parentIndex[to] = p;
                    q.push(to);
                }
            });
        }

        // Parent 연결
        for (let i = 0; i < N; i++) {
            const p = parentIndex[i];
            if (p !== null && p !== -1) {
                nodes[i].parent = nodes[p];
            }
        }
    }

    // ============================================================
    // hinge 정보 구성
    // ============================================================
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        const corners = [
            new BABYLON.Vector3(-0.5, 0, 0.5),
            new BABYLON.Vector3(0.5, 0, 0.5),
            new BABYLON.Vector3(0.5, 0, -0.5),
            new BABYLON.Vector3(-0.5, 0, -0.5)
        ];

        for (let i = 0; i < N; i++) {
            const p = parentIndex[i];
            if (p === null || p === -1) continue;

            const r = adjacency[p].find(x => x.to === i);
            if (!r) continue;

            let A, B;
            switch (r.edgeA) {
                case 0: A = corners[1]; B = corners[2]; break;
                case 1: A = corners[2]; B = corners[3]; break;
                case 2: A = corners[3]; B = corners[0]; break;
                case 3: A = corners[0]; B = corners[1]; break;
                default: A = corners[0]; B = corners[1];
            }

            hingeInfo[i] = {
                parent: p,
                axisLocal: B.subtract(A).normalize(),
                pivotLocal: A.add(B).scale(0.5),
            };
        }
    }

    // ============================================================
    // 2D 전개도 배치
    // ============================================================
    function layoutFlat2D() {
        for (let i = 0; i < facesSorted.length; i++) {
            const f = facesSorted[i];

            const cX = f.u + f.w / 2;
            const cY = f.v + f.h / 2;

            const x = cX - netCenter.x;
            const z = -(cY - netCenter.y);

            nodes[i].rotationQuaternion = BABYLON.Quaternion.Identity();
            nodes[i].position = new BABYLON.Vector3(x, 0, z);
        }
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

    // ============================================================
    // 접기 적용
    // ============================================================
    function applyFolding(angle) {
        // 부모 face만 원점 기준으로 fold
        for (let i = 0; i < facesSorted.length; i++) {
            const p = parentIndex[i];
            if (p === null || p === -1) continue;

            const hinge = hingeInfo[i];
            if (!hinge) continue;

            const axis = hinge.axisLocal;
            const pivot = hinge.pivotLocal;

            const worldAxis = BABYLON.Vector3.TransformNormal(
                axis,
                nodes[p].rotationQuaternion.toRotationMatrix()
            ).normalize();

            const worldPivot = BABYLON.Vector3.TransformCoordinates(
                pivot,
                nodes[p].getWorldMatrix()
            );

            const qRot = BABYLON.Quaternion.RotationAxis(worldAxis, angle);

            nodes[i].rotationQuaternion = qRot.multiply(nodes[p].rotationQuaternion);
            nodes[i].position = nodes[p].position
                .subtract(worldPivot)
                .rotateByQuaternionAroundPointToRef(qRot, worldPivot, new BABYLON.Vector3());
        }
    }

    // ============================================================
    // 애니메이션 루프
    // ============================================================
    function startBaseLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(() => {
            if (folding) {
                const diff = targetAngle - currentAngle;
                if (Math.abs(diff) < 0.001) {
                    currentAngle = targetAngle;
                    folding = false;
                } else currentAngle += foldSpeed * Math.sign(diff);

                applyFolding(currentAngle);
            }

            scene.render();
        });
    }

    // ============================================================
    // PUBLIC 함수들
    // ============================================================
    FoldEngine.foldImmediate = angle => {
        currentAngle = targetAngle = angle;
        applyFolding(angle);
    };

    FoldEngine.unfoldImmediate = () => {
        currentAngle = targetAngle = 0;
        layoutFlat2D();
    };

    FoldEngine.foldTo = angle => {
        targetAngle = angle;
        folding = true;
    };

    FoldEngine.unfold = () => FoldEngine.foldTo(0);

    FoldEngine.onResize = () => engine?.resize();

    // ============================================================
    // PUBLIC: loadNet (main.js와 호환)
    // ============================================================
    FoldEngine.loadNet = function (net) {
        if (!net) return;
        FoldEngine.buildFromFaces(net.faces, net.adjacency, net.rootIndex || 0);
        FoldEngine.unfoldImmediate();
    };

})();
