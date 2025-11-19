/**
 * foldEngine.js – ⭐ Babylon.js 최종 안정화 버전 ⭐
 * ------------------------------------------------------------
 * - adjacency 변환(from/to/dir → edgeA) 완전 지원
 * - 2D 전개도와 동일한 3D 평면 배치
 * - Parent Tree / hinge / folding 정상화
 * - foldTo(), foldImmediate(), unfoldImmediate() 정상 작동
 * - loadNet(main.js 호환)
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // Babylon.js 기본 참조
    // ------------------------------------------------------------
    let scene = null;
    let engine = null;
    let canvas = null;
    let camera = null;
    let light = null;

    let gridMesh = null;
    let groundMesh = null;

    // ------------------------------------------------------------
    // 데이터 구조
    // ------------------------------------------------------------
    let facesSorted = [];
    let nodes = [];
    let adjacency = [];
    let parentIndex = [];
    let hingeInfo = [];
    let rootIndex = 0;

    let netCenter = { x: 0, y: 0 };

    // 접기 상태
    let currentAngle = 0;
    let targetAngle = 0;
    let folding = false;
    const foldSpeed = 0.05;

    // 옵션
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
    FoldEngine.init = function (canvasEl, babEngine, babScene) {
        canvas = canvasEl;
        engine = babEngine;
        scene = babScene;

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
            gridMesh = BABYLON.MeshBuilder.CreateGround(
                "grid",
                { width: 20, height: 20, subdivisions: 40 },
                scene
            );
            const gm = new BABYLON.StandardMaterial("gridMat", scene);
            gm.wireframe = true;
            gm.alpha = 0.07;
            gridMesh.material = gm;
            gridMesh.position.y = -0.51;
        }

        groundMesh = BABYLON.MeshBuilder.CreateGround(
            "ground",
            { width: 40, height: 40, subdivisions: 1 },
            scene
        );
        const gm2 = new BABYLON.StandardMaterial("groundMat", scene);
        gm2.diffuseColor = new BABYLON.Color3(1, 1, 1);
        gm2.specularColor = new BABYLON.Color3(0, 0, 0);
        gm2.alpha = 0.0;
        groundMesh.material = gm2;
    }

    FoldEngine.setOptions = opt => {
        options = Object.assign({}, options, opt || {});
    };

    // ============================================================
    // ⭐ adjacency 변환(from/to/dir → edge index) ⭐
    // dir: up, down, left, right
    // ------------------------------------------------------------
    function convertAdjacency(faces, adjFlat) {
        const N = faces.length;
        const result = Array.from({ length: N }, () => []);

        const dirToEdge = {
            up: 2,      // 위쪽에 붙는 것은 child가 parent의 bottom-edge와 붙음
            down: 0,
            left: 1,
            right: 3
        };

        if (!Array.isArray(adjFlat)) return result;

        adjFlat.forEach(a => {
            const { from, to, dir } = a;
            if (from == null || to == null || !dir) return;

            const edgeA = dirToEdge[dir] ?? 0;

            result[from].push({
                to,
                edgeA,
                edgeB: edgeA
            });
        });

        return result;
    }

    // ============================================================
    // PUBLIC: faces + adjacency 로 3D 생성
    // ============================================================
    FoldEngine.buildFromFaces = function (faces, adjFlat, rootIdx) {
        disposeAll();

        facesSorted = faces.slice();
        rootIndex = rootIdx || 0;

        // ⭐ dir 기반 adjacency 변환
        adjacency = convertAdjacency(facesSorted, adjFlat);

        computeNetCenter();
        createMeshes();
        buildParentTree();
        buildHinges();

        layoutFlat2D();

        currentAngle = 0;
        targetAngle = 0;
        folding = false;
    };

    function disposeAll() {
        nodes.forEach(n => n.dispose?.());
        nodes = [];
    }

    // ============================================================
    // Mesh 생성
    // ============================================================
    function createMeshes() {
        nodes = [];

        const PALETTE = ["#FFD54F", "#81C784", "#64B5F6", "#BA68C8", "#F48FB1", "#FF8A65"];

        for (let i = 0; i < facesSorted.length; i++) {
            const f = facesSorted[i];

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + i,
                { size: options.cubeSize },
                scene
            );

            // 색상 처리
            let hex = "#ccc";
            if (typeof f.color === "string") hex = f.color;
            else if (typeof f.color === "number") hex = PALETTE[f.color % PALETTE.length];

            const mat = new BABYLON.StandardMaterial("mat_" + i, scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(hex);
            mat.alpha = options.faceOpacity;
            plane.material = mat;

            plane.rotationQuaternion = BABYLON.Quaternion.Identity();
            nodes.push(plane);
        }
    }

    // ============================================================
    // Parent Tree 구성 (BFS)
    // ============================================================
    function buildParentTree() {
        const N = facesSorted.length;
        parentIndex = Array(N).fill(-1);
        parentIndex[rootIndex] = null;

        const visited = Array(N).fill(false);
        visited[rootIndex] = true;

        const q = [rootIndex];

        while (q.length) {
            const p = q.shift();
            const neigh = adjacency[p] || [];

            neigh.forEach(n => {
                if (!visited[n.to]) {
                    visited[n.to] = true;
                    parentIndex[n.to] = p;
                    q.push(n.to);
                }
            });
        }

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
    function buildHinges() {
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

            const rel = adjacency[p].find(x => x.to === i);
            if (!rel) continue;

            let A, B;
            switch (rel.edgeA) {
                case 0: A = corners[1]; B = corners[2]; break;
                case 1: A = corners[2]; B = corners[3]; break;
                case 2: A = corners[3]; B = corners[0]; break;
                case 3: A = corners[0]; B = corners[1]; break;
                default: A = corners[0]; B = corners[1];
            }

            hingeInfo[i] = {
                parent: p,
                axisLocal: B.subtract(A).normalize(),
                pivotLocal: A.add(B).scale(0.5)
            };
        }
    }

    // ============================================================
    // 전개도 평면 배치
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

    function layoutFlat2D() {
        for (let i = 0; i < facesSorted.length; i++) {
            const f = facesSorted[i];

            const cx = f.u + f.w / 2;
            const cy = f.v + f.h / 2;

            const x = cx - netCenter.x;
            const z = -(cy - netCenter.y);

            nodes[i].rotationQuaternion = BABYLON.Quaternion.Identity();
            nodes[i].position = new BABYLON.Vector3(x, 0, z);
        }
    }

    // ============================================================
    // 접기 동작
    // ============================================================
    function applyFolding(angle) {
        for (let i = 0; i < facesSorted.length; i++) {
            const p = parentIndex[i];
            if (p === null || p === -1) continue;

            const hinge = hingeInfo[i];
            if (!hinge) continue;

            const axisWorld = BABYLON.Vector3.TransformNormal(
                hinge.axisLocal,
                nodes[p].rotationQuaternion.toRotationMatrix()
            ).normalize();

            const pivotWorld = BABYLON.Vector3.TransformCoordinates(
                hinge.pivotLocal,
                nodes[p].getWorldMatrix()
            );

            const qRot = BABYLON.Quaternion.RotationAxis(axisWorld, angle);

            nodes[i].rotationQuaternion = qRot.multiply(nodes[p].rotationQuaternion);
            nodes[i].position = nodes[p].position
                .subtract(pivotWorld)
                .rotateByQuaternionAroundPointToRef(
                    qRot,
                    pivotWorld,
                    new BABYLON.Vector3()
                );
        }
    }

    // ============================================================
    // Render Loop
    // ============================================================
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(() => {
            if (folding) {
                const diff = targetAngle - currentAngle;
                if (Math.abs(diff) < 0.001) {
                    currentAngle = targetAngle;
                    folding = false;
                } else {
                    currentAngle += foldSpeed * Math.sign(diff);
                }
                applyFolding(currentAngle);
            }
            scene.render();
        });
    }

    // ============================================================
    // PUBLIC: 접기 API
    // ============================================================
    FoldEngine.foldImmediate = rad => {
        currentAngle = targetAngle = rad;
        applyFolding(rad);
    };

    FoldEngine.unfoldImmediate = () => {
        currentAngle = targetAngle = 0;
        layoutFlat2D();
    };

    FoldEngine.foldTo = rad => {
        targetAngle = rad;
        folding = true;
    };

    FoldEngine.unfold = () => FoldEngine.foldTo(0);

    FoldEngine.onResize = () => engine?.resize();

    // ============================================================
    // PUBLIC: loadNet(main.js 호환)
    // ============================================================
    FoldEngine.loadNet = net => {
        if (!net) return;
        FoldEngine.buildFromFaces(net.faces, net.adjacency, net.rootIndex || 0);
        FoldEngine.unfoldImmediate();
    };

})();
