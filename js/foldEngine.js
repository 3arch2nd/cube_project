/**
 * foldEngine.js – ⭐ BABYLON.js 네이티브 XZ 평면 기반 완전 재설계 버전 ⭐
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
    let camera = null;
    let engine = null;

    let controls = null;
    let animationStarted = false;

    // ------------------------------------------------------------
    // 전개도 데이터 (유지)
    // ------------------------------------------------------------
    let facesSorted = [];
    let adjacency = [];
    let parentOf = [];
    let hingeInfo = [];
    let netCenter = { x: 0, y: 0 }; // 2D 평면 기준 중심

    let nodes = []; // BABYLON.TransformNode

    const EPS = 1e-6;

    // ------------------------------------------------------------
    // 색상 (선명) (유지)
    // ------------------------------------------------------------
    const FACE_COLORS = [
        0xff4d4d, 0xffd43b, 0x51cf66, 0x339af0, 0x845ef7, 0xf06595
    ];

    // Babylon.js 재질 생성 함수 (유지)
    function createFaceMaterial(scene, colorHex) {
        const mat = new BABYLON.StandardMaterial("faceMat" + colorHex, scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString("#" + colorHex.toString(16).padStart(6, '0'));
        mat.alpha = 0.78;
        mat.backFaceCulling = false;
        mat.disableLighting = false;
        return mat;
    }


    // ------------------------------------------------------------
    // 외부에서 필요로 하는 getter (유지)
    // ------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // ------------------------------------------------------------
    // 공통 렌더 루프 (유지)
    // ------------------------------------------------------------
    function startBaseLoop() {
        if (animationStarted || !engine || !scene) return;
        animationStarted = true;

        engine.runRenderLoop(function () {
            if (scene) {
                scene.render();
            }
        });

        window.addEventListener("resize", function () {
            engine.resize();
        });
    }

    // --------------------------------------------------------------------
    // INIT (Babylon.js 환경 생성 및 탑 뷰 카메라 설정)
    // --------------------------------------------------------------------
    FoldEngine.init = function (canvas) {
        if (!canvas) {
            console.warn("[FoldEngine.init] canvas is null");
            return;
        }
        if (engine) {
             return;
        }

        engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(1, 1, 1, 1);

        // ⭐ 탑 뷰 (Top View) 설정: 전개도가 놓이는 XZ 평면을 위에서 내려다보는 시점
        // alpha: 수평 회전 (-90도), beta: 수직 0도 (완전히 위), radius: 거리 8
        camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI / 2, 0, 8, BABYLON.Vector3.Zero(), scene);
        camera.setTarget(BABYLON.Vector3.Zero());

        camera.attachControl(canvas, true);

        camera.inertia = 0.8;
        camera.angularSensibilityX = 3000;
        camera.angularSensibilityY = 3000;
        camera.minZ = 0.01;
        camera.maxZ = 1000;

        new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene); // 위에서 비추는 빛
        new BABYLON.HemisphericLight("light2", new BABYLON.Vector3(0, -1, 0), scene); // 아래에서 비추는 빛

        controls = camera;

        startBaseLoop();
    };

    // --------------------------------------------------------------------
    // 색상 유틸 (유지)
    // --------------------------------------------------------------------
    function getFaceColorById(id) {
        return FACE_COLORS[id % FACE_COLORS.length];
    }

    // --------------------------------------------------------------------
    // 3D 단위 면 생성 (XZ 평면 기반)
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        // ⭐ 개선: Plane 생성 시 초기 회전 제거. XZ 평면에 놓인 면(Y축 정방향) 생성
        const plane = BABYLON.MeshBuilder.CreatePlane("face" + faceId, { width: 1, height: 1, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);

        plane.material = createFaceMaterial(scene, getFaceColorById(faceId));

        const g = new BABYLON.TransformNode("group" + faceId, scene);
        plane.parent = g;
        
        // ⭐ Babylon.js의 Plane은 기본적으로 YZ 평면에 생성되지만,
        // MeshBuilder.CreatePlane의 sideOrientation 기본값은 BABYLON.Mesh.DEFAULTSIDE(front face Z축)
        // 여기서는 XZ 평면(Y축을 바라보는)에 눕히는 것이 2D 전개도 배치에 유리하므로,
        // Plane을 XZ 평면에 눕히는 회전을 유지하거나, Plane 대신 Box를 사용해야 함.
        // 기존 큐브 프로젝트와 일관성을 위해 XZ 평면에 눕히는 회전을 유지합니다.
        plane.rotation.x = Math.PI / 2; // YZ -> XZ 평면에 눕힘

        plane.setPivotPoint(BABYLON.Vector3.Zero());

        g.id = faceId;
        g.metadata = { isCubeFace: true };
        nodes.push(g);

        return g;
    }

// PART 2 / 3 --------------------------------------------------------------

    // --------------------------------------------------------------------
    // NET CENTER 계산 (유지)
    // --------------------------------------------------------------------
    function computeNetCenter() {
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;

        facesSorted.forEach(f => {
            minU = Math.min(minU, f.u);
            minV = Math.min(minV, f.v);
            maxU = Math.max(maxU, f.u + f.w);
            maxV = Math.max(maxV, f.v + f.h);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;
    }


    // --------------------------------------------------------------------
    // adjacency 구성 (유지)
    // --------------------------------------------------------------------
    function buildAdjacency() {
        const N = facesSorted.length;
        adjacency = [...Array(N)].map(() => []);

        function edges(f) {
            return [
                { a: [f.u, f.v], b: [f.u + f.w, f.v] },
                { a: [f.u + f.w, f.v], b: [f.u + f.w, f.v + f.h] },
                { a: [f.u + f.w, f.v + f.h], b: [f.u, f.v + f.h] },
                { a: [f.u, f.v + f.h], b: [f.u, f.v] }
            ];
        }

        function sameEdge(e1, e2) {
            const isSame1 = (
                Math.abs(e1.a[0] - e2.b[0]) < EPS &&
                Math.abs(e1.a[1] - e2.b[1]) < EPS &&
                Math.abs(e1.b[0] - e2.a[0]) < EPS &&
                Math.abs(e1.b[1] - e2.a[1]) < EPS
            );
            const isSame2 = (
                Math.abs(e1.a[0] - e2.a[0]) < EPS &&
                Math.abs(e1.a[1] - e2.a[1]) < EPS &&
                Math.abs(e1.b[0] - e2.b[0]) < EPS &&
                Math.abs(e1.b[1] - e2.b[1]) < EPS
            );
            return isSame1 || isSame2;
        }

        for (let i = 0; i < N; i++) {
            const Ei = edges(facesSorted[i]);
            for (let j = i + 1; j < N; j++) {
                const Ej = edges(facesSorted[j]);

                for (let a = 0; a < 4; a++) {
                    for (let b = 0; b < 4; b++) {
                        if (sameEdge(Ei[a], Ej[b])) {
                            adjacency[i].push({ to: j, edgeA: a, edgeB: b });
                            adjacency[j].push({ to: i, edgeA: b, edgeB: a });
                        }
                    }
                }
            }
        }
    }


    // --------------------------------------------------------------------
    // BFS 트리 구성 (유지)
    // --------------------------------------------------------------------
    function buildTree() {
        const N = facesSorted.length;
        parentOf = Array(N).fill(null);

        parentOf[0] = -1;
        const Q = [0];

        while (Q.length) {
            const p = Q.shift();

            adjacency[p].forEach(rel => {
                if (parentOf[rel.to] === null) {
                    parentOf[rel.to] = p;
                    Q.push(rel.to);
                }
            });
        }
    }


    // --------------------------------------------------------------------
    // 기존 3D 면 제거 (유지)
    // --------------------------------------------------------------------
    function clearOldFacesFromScene() {
        nodes.forEach(g => {
            if (g) g.dispose(false, true);
        });
        nodes = [];
    }


    // --------------------------------------------------------------------
    // 2D 평면 배치 (XZ 평면으로 매핑)
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const rootFace = facesSorted[0];
        // X 좌표: 2D U - Net Center X
        const rootX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        // Z 좌표: 2D V - Net Center Y에 반전 적용 (Babylon.js Y 상향)
        const rootZ = -((rootFace.v + rootFace.h / 2) - netCenter.y);

        const worldPos = [];
        const worldRot = [];

        // Y축은 0 (XZ 평면에 놓임)
        worldPos[0] = new BABYLON.Vector3(rootX, 0, rootZ);
        worldRot[0] = new BABYLON.Quaternion();

        nodes[0].position.copyFrom(worldPos[0]);
        nodes[0].rotationQuaternion = worldRot[0];

        // BFS 배치
        const Q = [0];

        while (Q.length) {
            const p = Q.shift();
            const pFace = facesSorted[p];

            const pCx = pFace.u + pFace.w / 2;
            const pCy = pFace.v + pFace.h / 2;

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const f = facesSorted[i];

                    const cCx = f.u + f.w / 2;
                    const cCy = f.v + f.h / 2;

                    const dx = cCx - pCx;
                    // Z축 (V축) 변위
                    const dz = -(cCy - pCy);

                    worldPos[i] = new BABYLON.Vector3(
                        worldPos[p].x + dx,
                        0, // Y축은 0
                        worldPos[p].z + dz
                    );
                    worldRot[i] = new BABYLON.Quaternion();

                    nodes[i].position.copyFrom(worldPos[i]);
                    nodes[i].rotationQuaternion = worldRot[i];

                    Q.push(i);
                }
            }
        }
    }


    // --------------------------------------------------------------------
    // hinge 정보 구성 (XZ 평면 기반)
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        // ⭐ 개선: 로컬 좌표계 재정의 (X, Z 평면)
        // 2D 전개도의 모서리: U(x)와 V(y) 대신 X(x)와 -Z(z)로 매핑
        const corners = [
            new BABYLON.Vector3(-0.5, 0, -0.5), // Edge 0: X=-0.5, Z=-0.5
            new BABYLON.Vector3(0.5, 0, -0.5),  // Edge 1: X=0.5, Z=-0.5
            new BABYLON.Vector3(0.5, 0, 0.5),   // Edge 2: X=0.5, Z=0.5
            new BABYLON.Vector3(-0.5, 0, 0.5)   // Edge 3: X=-0.5, Z=0.5
        ];

        for (let i = 1; i < N; i++) {
            const p = parentOf[i];
            if (p === -1 || p === null) continue;

            const rel = adjacency[p].find(r => r.to === i);
            if (!rel) continue;

            const edgeId = rel.edgeA;
            let A, B;

            switch (edgeId) {
                // edgeId는 2D 전개도 기준 모서리 순서 (0: 하단, 1: 우측, 2: 상단, 3: 좌측)
                case 0: A = corners[0]; B = corners[1]; break; // 2D: (u,v) -> (u+w, v) => XZ: (-0.5,-0.5) -> (0.5,-0.5)
                case 1: A = corners[1]; B = corners[2]; break;
                case 2: A = corners[2]; B = corners[3]; break;
                case 3: A = corners[3]; B = corners[0]; break;
                default: continue;
            }

            const f = facesSorted[i];
            const pf = facesSorted[p];

            // 2D 평면에서의 자식 중심과 부모 중심 간의 상대 거리
            const dx = (f.u + f.w / 2) - (pf.u + pf.w / 2);
            const dz = -((f.v + f.h / 2) - (pf.v + pf.h / 2)); // Z축 반전

            hingeInfo[i] = {
                parent: p,
                A_local: A.clone(),
                // 회전 축은 XZ 평면에 놓임 (Y=0)
                axis_local: B.subtract(A).normalize(),
                // 자식 중심의 로컬 위치 (Y=0)
                childCenter_local: new BABYLON.Vector3(dx, 0, dz)
            };
        }
    }


    // --------------------------------------------------------------------
    // 접힘 계산 applyFolding(angle) (XZ 평면 기반)
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = []; // 월드 회전 (Quaternion)
        const Pw = []; // 월드 위치 (Vector3)

        // Root Face (facesSorted[0]) 초기 월드 위치 및 회전 설정 (Y=0)
        Pw[0] = new BABYLON.Vector3(
            (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x,
            0,
            -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y) // Z축 반전
        );
        Qw[0] = new BABYLON.Quaternion();

        const Q = [0]; // BFS 큐

        while (Q.length) {
            const p = Q.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    // 오류 방지
                    if (!info || !info.axis_local) { 
                         Q.push(i);
                         continue; 
                    }

                    const parentQ = Qw[p];
                    const parentP = Pw[p];

                    // 1. 로컬 회전
                    const qLocal = BABYLON.Quaternion.RotationAxis(
                        info.axis_local,
                        angle
                    );

                    // 2. 자식 중심의 힌지 중심 기준 로컬 변위 r0
                    let r0 = info.childCenter_local.clone().subtract(info.A_local);

                    // 3. 로컬 회전 적용: r0를 qLocal만큼 회전
                    r0 = BABYLON.Vector3.TransformCoordinates(r0, qLocal.toRotationMatrix());

                    // 4. 로컬 회전 적용 후의 자식 중심 위치 cLocal
                    const cLocal = info.A_local.clone().add(r0);

                    // 5. 월드 위치/회전 계산
                    let cWorld = cLocal.clone().rotateByQuaternionToRef(parentQ, new BABYLON.Vector3());
                    cWorld = cWorld.add(parentP);

                    Pw[i] = cWorld;
                    Qw[i] = parentQ.multiply(qLocal);

                    Q.push(i);
                }
            }
        }

        // 위치/회전 적용
        for (let i = 0; i < N; i++) {
            nodes[i].position = Pw[i];
            nodes[i].rotationQuaternion = Qw[i];
        }
    }


// PART 3 / 3 --------------------------------------------------------------


    // --------------------------------------------------------------------
    // PUBLIC: 펼쳐진 상태로 즉시 적용
    // --------------------------------------------------------------------
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
        if (controls) {
            controls.target = BABYLON.Vector3.Zero();
        }
    };


    // --------------------------------------------------------------------
    // PUBLIC: loadNet (카메라 타겟 개선)
    // --------------------------------------------------------------------
    FoldEngine.loadNet = function (net) {
        if (!net || !Array.isArray(net.faces)) {
            console.warn("[FoldEngine.loadNet] invalid net");
            return Promise.resolve();
        }
        if (!scene || !camera || !engine) {
            console.warn("[FoldEngine.loadNet] init 먼저 필요");
            return Promise.resolve();
        }

        // 1) 전개도 데이터 준비
        facesSorted = [...net.faces].slice().sort((a, b) => a.id - b.id);

        computeNetCenter();
        buildAdjacency();
        buildTree();
        buildHingeInfo();

        // 2) 이전 면들 제거
        clearOldFacesFromScene();

        // 3) 새 면들 생성
        nodes = [];
        facesSorted.forEach(face => {
            const g = createUnitFace(face.id);
            nodes.push(g);
        });

        // 4) 평면 상태로 배치
        layoutFlat2D();

        // 5) 카메라/컨트롤 타겟 초기화 (탑 뷰 시점 및 타겟 설정)
        camera.radius = 8;
        camera.alpha = -Math.PI / 2; // -90도
        camera.beta = 0;             // 탑 뷰 (Top View)
        
        // 전개도 중심을 타겟으로 설정 (Y=0)
        const targetX = (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x;
        const targetZ = -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y);
        const targetPosition = new BABYLON.Vector3(targetX, 0, targetZ);


        if (controls) {
            controls.target = targetPosition; 
            controls.attachControl(engine.getRenderingCanvas(), true); 
        }

        return Promise.resolve();
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldAnimate – 학생용 접기 애니메이션 (Controls 잠금 수정)
    // --------------------------------------------------------------------
    FoldEngine.foldAnimate = function (sec = 2.0) {
        return new Promise(resolve => {

            // 애니메이션 시작 시 컨트롤 잠금
            if (controls) {
                controls.detachControl(engine.getRenderingCanvas(), true);
            }

            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2); // 0도 (펼쳐짐) → 90도 (접힘)

                applyFolding(angle);

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    };


    // --------------------------------------------------------------------
    // PUBLIC: showSolvedView – 즉시 복귀 및 Controls 해제
    // --------------------------------------------------------------------
    FoldEngine.showSolvedView = function (sec = 0.0) {
        return new Promise(resolve => {

            layoutFlat2D(); 
            
            // 카메라 시점 초기화 (탑 뷰)
            camera.radius = 8;
            camera.alpha = -Math.PI / 2;
            camera.beta = 0;

            // 전개도 중심을 타겟으로 설정
            const targetX = (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x;
            const targetZ = -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y);
            const targetPosition = new BABYLON.Vector3(targetX, 0, targetZ);

            if (controls) {
                controls.attachControl(engine.getRenderingCanvas(), true);
                controls.target = targetPosition;
            }

            resolve(); // 즉시 완료

        });
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldStaticTo (validator 전용 – 즉시 특정 각도로 접기)
    // --------------------------------------------------------------------
    FoldEngine.foldStaticTo = function (angleRad) {
        applyFolding(angleRad);
    };


})();
