/**
 * foldEngine.js – ⭐ 최종 안정화 버전 (인접성 테이블 수정 및 불일치 해결) ⭐
 * ------------------------------------------------------------
 * PART 1 / 3
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // BABYLON 기본 객체 (유지)
    // ------------------------------------------------------------
    let scene = null;
    let engine = null;
    let canvas = null;
    let camera = null;
    let light = null;

    // ------------------------------------------------------------
    // 3D 그리드/바닥 관련 (유지)
    // ------------------------------------------------------------
    let gridMesh = null;
    let groundMesh = null;

    // ------------------------------------------------------------
    // 접기 관련 데이터 구조
    // ------------------------------------------------------------
    let facesSorted = [];     // validator.js에서 받은 faces 배열을 넘겨서 정렬한 결과
    let nodes = [];           // 각 face에 대응하는 Babylon Mesh (Parented box faces)
    let adjacency = [];       // 인접 관계 테이블
    let parentIndex = [];     // 각 face별 parent face index
    let hingeInfo = [];       // 힌지 정보 (회전축/회전점) – buildHingeInfo 에서 생성
    let rootIndex = 0;        // 루트가 되는 face index (보통 0번)

    // ------------------------------------------------------------
    // 접기 애니메이션 상태
    // ------------------------------------------------------------
    let currentAngle = 0;     // 현재 접힌 각도 (라디안)
    let targetAngle = 0;      // 목표 각도
    let folding = false;      // 애니메이션 진행 여부
    let foldSpeed = 0.03;     // 프레임당 변화량(라디안) – 적당히 튜닝

    // ------------------------------------------------------------
    // 전체 전개도의 중심 (2D u,v 기준)
    // ------------------------------------------------------------
    let netCenter = { x: 0, y: 0 };

    // ------------------------------------------------------------
    // 외부에서 넘겨주는 옵션 (validator, UI 등에서 설정)
    // ------------------------------------------------------------
    let options = {
        cubeSize: 1.0,
        faceOpacity: 0.8,
        showGrid: true,
        backgroundColor: "#ffffff",
    };

    // ------------------------------------------------------------
    // 상수 정의
    // ------------------------------------------------------------
    const Y_OFFSET_STEP = 0.0;   // 높이 오프셋 (정육면체인 경우 0으로 두어도 됨)

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
    // 환경 (그리드, 바닥, 배경색)
    // ============================================================
    function setupEnvironment() {
        if (!scene) return;

        const bg = BABYLON.Color3.FromHexString(options.backgroundColor || "#ffffff");
        scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1.0);

        if (options.showGrid) {
            const size = 6;
            const divisions = 12;
            gridMesh = BABYLON.MeshBuilder.CreateGround(
                "grid",
                { width: size, height: size, subdivisions: divisions },
                scene
            );
            const gridMat = new BABYLON.StandardMaterial("gridMat", scene);
            gridMat.wireframe = true;
            gridMat.alpha = 0.2;
            gridMesh.material = gridMat;
            gridMesh.position.y = -0.51;
        }

        groundMesh = BABYLON.MeshBuilder.CreateGround(
            "ground",
            { width: 20, height: 20, subdivisions: 1 },
            scene
        );
        const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
        groundMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
        groundMat.alpha = 0.0;
        groundMesh.material = groundMat;
    }

    // ============================================================
    // PUBLIC: 옵션 설정
    // ============================================================
    FoldEngine.setOptions = function (opt) {
        options = Object.assign({}, options, opt || {});

        if (scene) {
            const bg = BABYLON.Color3.FromHexString(options.backgroundColor || "#ffffff");
            scene.clearColor = new BABYLON.Color4(bg.r, bg.g, bg.b, 1.0);
        }
    };

    // ============================================================
    // PUBLIC: faces 데이터로부터 3D mesh 생성 + adjacency 정보 구성
    // ============================================================
    FoldEngine.buildFromFaces = function (faces, adj, rootIdx) {
        disposeAll();

        facesSorted = faces.slice();
        adjacency = adj.map(row => row.map(item => Object.assign({}, item)));
        rootIndex = rootIdx || 0;

        computeNetCenter();
        createAllFacesMeshes();
        buildParentTree();
        buildHingeInfo();

        layoutFlat2D();
        currentAngle = 0;
        targetAngle = 0;
        folding = false;
    };

    // ------------------------------------------------------------
    // 정리: 모든 mesh 제거
    // ------------------------------------------------------------
    function disposeAll() {
        if (nodes && nodes.length) {
            nodes.forEach(mesh => {
                if (mesh && mesh.dispose) mesh.dispose();
            });
        }
        nodes = [];

        if (gridMesh && gridMesh.dispose) {
            gridMesh.dispose();
            gridMesh = null;
        }
        if (groundMesh && groundMesh.dispose) {
            groundMesh.dispose();
            groundMesh = null;
        }
    }

    // ============================================================
    // 정육면체 면 Mesh 생성
    // ============================================================
    function createAllFacesMeshes() {
        nodes = [];
        const N = facesSorted.length;
        const size = options.cubeSize || 1.0;

        for (let i = 0; i < N; i++) {
            const face = facesSorted[i];

            const plane = BABYLON.MeshBuilder.CreatePlane(
                "face_" + i,
                { size: size },
                scene
            );

            const mat = new BABYLON.StandardMaterial("faceMat_" + i, scene);
            mat.diffuseColor = new BABYLON.Color3(
                face.color.r,
                face.color.g,
                face.color.b
            );
            mat.alpha = options.faceOpacity;
            plane.material = mat;

            plane.metadata = { faceIndex: i };
            plane.isPickable = true;

            plane.rotationQuaternion = BABYLON.Quaternion.Identity();

            nodes.push(plane);
        }
    }

    // ============================================================
    // Parent Tree 구성
    // ============================================================
    function buildParentTree() {
        const N = facesSorted.length;
        parentIndex = new Array(N).fill(-1);
        parentIndex[rootIndex] = null;

        const visited = new Array(N).fill(false);
        visited[rootIndex] = true;

        const queue = [rootIndex];
        while (queue.length > 0) {
            const p = queue.shift();
            const neighbors = adjacency[p] || [];
            neighbors.forEach(nei => {
                const to = nei.to;
                if (!visited[to]) {
                    visited[to] = true;
                    parentIndex[to] = p;
                    queue.push(to);
                }
            });
        }

        for (let i = 0; i < N; i++) {
            const p = parentIndex[i];
            if (p === null || p === -1) continue;
            nodes[i].parent = nodes[p];
        }
    }

    // ============================================================
    // PART 2는 아래에 계속…

 // PART 2 / 3 --------------------------------------------------------------

    // --------------------------------------------------------------------
    // NET CENTER 계산 (유지)
    // --------------------------------------------------------------------
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

    // --------------------------------------------------------------------
    // 평면(2D) 전개도 배치 → 3D Planes 위치/회전 초기화
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const worldPos = [];
        const worldRot = [];
        
        for (let i = 0; i < N; i++) {
            const f = facesSorted[i];
            
            const cCx = f.u + f.w / 2;
            const cCy = f.v + f.h / 2;

            const rootX = cCx - netCenter.x;
            const rootZ = -(cCy - netCenter.y);
            
            const yOffset = 0 * Y_OFFSET_STEP;

            worldPos[i] = new BABYLON.Vector3(rootX, yOffset, rootZ); 
            // ✅ Babylon.js에서 회전의 초기값은 Identity Quaternion으로!
            worldRot[i] = BABYLON.Quaternion.Identity();

            nodes[i].position.copyFrom(worldPos[i]);
            nodes[i].rotationQuaternion = worldRot[i];
        }
    }


    // -------------------------------------------------------------
    // hinge 정보 구성 (로컬 좌표계 유지)
    // -------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        // 3D XZ 로컬 좌표: 2D 데이터의 CCW 순서 (0, 1, 2, 3)에 맞추어 정의
        const corners = [
            new BABYLON.Vector3(-0.5, 0, 0.5),   // A: Left Bottom 
            new BABYLON.Vector3(0.5, 0, 0.5),    // B: Right Bottom
            new BABYLON.Vector3(0.5, 0, -0.5),   // C: Right Top
            new BABYLON.Vector3(-0.5, 0, -0.5)   // D: Left Top
        ];

        for (let i = 0; i < N; i++) {
            const p = parentIndex[i];
            if (p === null || p === -1) {
                hingeInfo[i] = null;
                continue;
            }

            const rel = adjacency[p].find(r => r.to === i);
            if (!rel) {
                hingeInfo[i] = null;
                continue;
            }

            const edgeId = rel.edgeA;
            let A, B;

            switch (edgeId) {
                // 2D 인덱스 0번 모서리 (Top edge)
                case 0: A = corners[1]; B = corners[2]; break; 
                // 2D 인덱스 1번 모서리 (Right edge)
                case 1: A = corners[2]; B = corners[3]; break; 
                // 2D 인덱스 2번 모서리 (Bottom edge)
                case 2: A = corners[3]; B = corners[0]; break; 
                // 2D 인덱스 3번 모서리 (Left edge)
                case 3: A = corners[0]; B = corners[1]; break; 
                default:
                    A = corners[0]; 
                    B = corners[1];
            }

            const mid = A.add(B).scale(0.5);
            const axis = B.subtract(A).normalize();

            hingeInfo[i] = {
                parent: p,
                axisLocal: axis,
                pivotLocal: mid
            };
        }
    }


    // -------------------------------------------------------------
    // 접기 적용 함수 (중심 로직)
    // -------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Pw = [];
        const Qw = [];

        const rootFace = facesSorted[rootIndex];
        const cCx = rootFace.u + rootFace.w / 2;
        const cCy = rootFace.v + rootFace.h / 2;

        const rootX = cCx - netCenter.x;
        const rootZ = -(cCy - netCenter.y);

        Pw[0] = new BABYLON.Vector3(rootX, 0 * Y_OFFSET_STEP, rootZ); 
        // ✅ Babylon.js: 회전 초기값은 Identity
        Qw[0] = BABYLON.Quaternion.Identity();

        const Q = [0];
        while (Q.length > 0) {
            const p = Q.shift();
            const children = [];

            for (let i = 0; i < N; i++) {
                if (parentIndex[i] === p) children.push(i);
            }
            children.forEach(i => {
                Q.push(i);
            });

            const Pw_p = Pw[p];
            const Qw_p = Qw[p];

            nodes[p].position.copyFrom(Pw_p);
            nodes[p].rotationQuaternion = Qw_p;

            children.forEach(i => {
                const hinge = hingeInfo[i];
                if (!hinge) return;

                const localAxis = hinge.axisLocal;
                const localPivot = hinge.pivotLocal;

                const axisWorld = BABYLON.Vector3.TransformNormal(
                    localAxis,
                    Qw_p.toRotationMatrix()
                ).normalize();

                const pivotWorld = BABYLON.Vector3.TransformCoordinates(
                    localPivot,
                    getTransformMatrix(Pw_p, Qw_p)
                );

                const relRot = BABYLON.Quaternion.RotationAxis(axisWorld, angle);
                const Qw_i = relRot.multiply(Qw_p);

                const Pw_i = Pw_p
                    .subtract(pivotWorld)
                    .rotateByQuaternionAroundPointToRef(
                        relRot,
                        pivotWorld,
                        new BABYLON.Vector3()
                    );

                Pw[i] = Pw_i;
                Qw[i] = Qw_i;
            });
        }

        for (let i = 0; i < N; i++) {
            if (Pw[i] && Qw[i]) {
                nodes[i].position.copyFrom(Pw[i]);
                nodes[i].rotationQuaternion = Qw[i];
            }
        }
    }

    // -------------------------------------------------------------
    // Transform Matrix 생성
    // -------------------------------------------------------------
    function getTransformMatrix(position, rotationQ) {
        const mat = new BABYLON.Matrix();
        rotationQ.toRotationMatrix(mat);
        mat.setTranslation(position);
        return mat;
    }

    // ============================================================
    // PUBLIC: 애니메이션 제어
    // ============================================================
    FoldEngine.foldTo = function (angleRad) {
        targetAngle = angleRad;
        folding = true;
    };

    FoldEngine.unfold = function () {
        targetAngle = 0;
        folding = true;
    };

    FoldEngine.foldImmediate = function (angleRad) {
        currentAngle = angleRad;
        targetAngle = angleRad;
        folding = false;
        applyFolding(currentAngle);
    };

    FoldEngine.unfoldImmediate = function () {
        currentAngle = 0;
        targetAngle = 0;
        folding = false;
        layoutFlat2D();
    };

    // ============================================================
    // PART 3는 아래에 계속…

 // PART 3 / 3 --------------------------------------------------------------


    // --------------------------------------------------------------------
    // PUBLIC: 펼쳐진 상태로 즉시 적용 (유지)
    // --------------------------------------------------------------------
    FoldEngine.reset = function () {
        layoutFlat2D();
        currentAngle = 0;
        targetAngle = 0;
        folding = false;
    };

    // --------------------------------------------------------------------
    // 애니메이션 업데이트 (매 프레임 호출)
    // --------------------------------------------------------------------
    function updateFolding() {
        if (!folding) return;

        const diff = targetAngle - currentAngle;
        if (Math.abs(diff) < 0.0001) {
            currentAngle = targetAngle;
            folding = false;
            return;
        }

        const step = foldSpeed * Math.sign(diff);
        if (Math.abs(step) > Math.abs(diff)) {
            currentAngle = targetAngle;
        } else {
            currentAngle += step;
        }

        applyFolding(currentAngle);
    }

    // --------------------------------------------------------------------
    // 외부에서 필요로 하는 getter (유지)
    // --------------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // --------------------------------------------------------------------
    // 공통 렌더 루프 (유지)
    // --------------------------------------------------------------------
    function startBaseLoop() {
        if (engine && scene) {
            engine.runRenderLoop(function () {
                updateFolding();
                scene.render();
            });
        }
    }

    // --------------------------------------------------------------------
    // PUBLIC: 씬 리사이즈 핸들러
    // --------------------------------------------------------------------
    FoldEngine.onResize = function () {
        if (engine) {
            engine.resize();
        }
    };

    // --------------------------------------------------------------------
    // PUBLIC: foldStaticTo (validator 전용 – 즉시 특정 각도로 접기) (유지)
    // --------------------------------------------------------------------
    FoldEngine.foldStaticTo = function (angleRad) {
        applyFolding(angleRad);
    };
    
// ============================================================
// PUBLIC: loadNet (main.js 호환용)
// ============================================================
FoldEngine.loadNet = function (net) {
    if (!net) return;

    // net.faces, net.adjacency, net.rootIndex 구조라고 가정
    const faces = net.faces;
    const adj = net.adjacency;
    const root = net.rootIndex || 0;

    // 실제 mesh 생성
    FoldEngine.buildFromFaces(faces, adj, root);

    // 펼친 상태에서 시작
    FoldEngine.unfoldImmediate();
};


})();
