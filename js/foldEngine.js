/**
 * foldEngine.js – ⭐ BABYLON.js 최종 작동 버전 (최종 수학적 오류 해결 및 좌표계 일관성 확보) ⭐
 * ------------------------------------------------------------
 * PART 1 / 3
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // BABYLON 기본 객체
    // ------------------------------------------------------------
    let scene = null;
    let camera = null;
    let engine = null;

    let controls = null;
    let animationStarted = false;

    // ------------------------------------------------------------
    // 전개도 데이터
    // ------------------------------------------------------------
    let facesSorted = [];
    let adjacency = [];
    let parentOf = [];
    let hingeInfo = [];
    let netCenter = { x: 0, y: 0 };

    let nodes = []; // BABYLON.TransformNode

    const EPS = 1e-6;

    // ------------------------------------------------------------
    // 색상 (선명)
    // ------------------------------------------------------------
    const FACE_COLORS = [
        0xff4d4d, 0xffd43b, 0x51cf66, 0x339af0, 0x845ef7, 0xf06595
    ];

    // Babylon.js 재질 생성 함수
    function createFaceMaterial(scene, colorHex) {
        const mat = new BABYLON.StandardMaterial("faceMat" + colorHex, scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString("#" + colorHex.toString(16).padStart(6, '0'));
        mat.alpha = 0.78;
        mat.backFaceCulling = false;
        mat.disableLighting = false;
        return mat;
    }


    // ------------------------------------------------------------
    // 외부에서 필요로 하는 getter
    // ------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };

    // ------------------------------------------------------------
    // 공통 렌더 루프 (Babylon.js의 Engine 루프로 대체)
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
    // INIT (Babylon.js 환경 생성)
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

        // ArcRotateCamera: 2D 정면 시점
        camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI / 2, Math.PI / 2, 8, BABYLON.Vector3.Zero(), scene);
        camera.setTarget(BABYLON.Vector3.Zero());

        camera.attachControl(canvas, true);

        camera.inertia = 0.8;
        camera.angularSensibilityX = 3000;
        camera.angularSensibilityY = 3000;
        camera.minZ = 0.01; 
        camera.maxZ = 1000;

        new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
        new BABYLON.HemisphericLight("light2", new BABYLON.Vector3(0, -1, 0), scene);

        controls = camera;

        startBaseLoop();
    };

    // --------------------------------------------------------------------
    // 색상 유틸
    // --------------------------------------------------------------------
    function getFaceColorById(id) {
        return FACE_COLORS[id % FACE_COLORS.length];
    }

    // --------------------------------------------------------------------
    // 3D 단위 면 생성
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        const plane = BABYLON.MeshBuilder.CreatePlane("face" + faceId, { width: 1, height: 1, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);

        plane.material = createFaceMaterial(scene, getFaceColorById(faceId));

        const g = new BABYLON.TransformNode("group" + faceId, scene);
        plane.parent = g;

        // Plane이 XY평면에 눕도록 초기 회전
        plane.rotation.x = Math.PI / 2;

        plane.setPivotPoint(BABYLON.Vector3.Zero());

        g.id = faceId;
        g.metadata = { isCubeFace: true };
        nodes.push(g);

        return g;
    }

// PART 2 / 3 --------------------------------------------------------------

    // --------------------------------------------------------------------
    // NET CENTER 계산
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
    // adjacency 구성
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
    // BFS 트리 구성
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
    // 기존 3D 면 제거
    // --------------------------------------------------------------------
    function clearOldFacesFromScene() {
        nodes.forEach(g => {
            if (g) g.dispose(false, true);
        });
        nodes = [];
    }


    // --------------------------------------------------------------------
    // 2D 평면 배치
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const rootFace = facesSorted[0];
        const rootX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        // Y축 반전 적용
        const rootY = -((rootFace.v + rootFace.h / 2) - netCenter.y);

        const worldPos = [];
        const worldRot = [];

        worldPos[0] = new BABYLON.Vector3(rootX, rootY, 0);
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
                    // Y축 반전 적용
                    const dy = -(cCy - pCy);

                    worldPos[i] = new BABYLON.Vector3(
                        worldPos[p].x + dx,
                        worldPos[p].y + dy,
                        0
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
    // hinge 정보 구성
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        const corners = [
            new BABYLON.Vector3(-0.5, 0.5, 0),
            new BABYLON.Vector3(0.5, 0.5, 0),
            new BABYLON.Vector3(0.5, -0.5, 0),
            new BABYLON.Vector3(-0.5, -0.5, 0)
        ];

        for (let i = 1; i < N; i++) {
            const p = parentOf[i];
            if (p === -1 || p === null) continue;

            const rel = adjacency[p].find(r => r.to === i);
            if (!rel) continue;

            const edgeId = rel.edgeA;
            let A, B;

            switch (edgeId) {
                case 0: A = corners[0]; B = corners[1]; break; 
                case 1: A = corners[1]; B = corners[2]; break;
                case 2: A = corners[2]; B = corners[3]; break;
                case 3: A = corners[3]; B = corners[0]; break;
                default: continue; // 예외 처리 추가
            }

            const f = facesSorted[i];
            const pf = facesSorted[p];

            const dx = (f.u + f.w / 2) - (pf.u + pf.w / 2);
            const dy = -((f.v + f.h / 2) - (pf.v + pf.h / 2)); // Y축 반전

            hingeInfo[i] = {
                parent: p,
                A_local: A.clone(),
                axis_local: B.subtract(A).normalize(),
                childCenter_local: new BABYLON.Vector3(dx, dy, 0)
            };
        }
    }


    // --------------------------------------------------------------------
    // 접힘 계산 applyFolding(angle) - 수학적 오류 해결 및 안정화
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = []; // 월드 회전 (Quaternion)
        const Pw = []; // 월드 위치 (Vector3)

        // Root Face (facesSorted[0]) 초기 월드 위치 및 회전 설정
        Pw[0] = new BABYLON.Vector3(
            (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x,
            -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y), // Y축 반전
            0
        );
        Qw[0] = new BABYLON.Quaternion();

        const Q = [0]; // BFS 큐

        while (Q.length) {
            const p = Q.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    // ⭐ 개선: hingeInfo 및 axis_local 유효성 검사 (오류 방지)
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

        // 5) 카메라/컨트롤 타겟 초기화 (정면 뷰 및 타겟 설정)
        camera.radius = 8;
        camera.alpha = -Math.PI / 2;
        camera.beta = Math.PI / 2;
        
        // ⭐ 개선: 전개도의 중심을 정확히 타겟으로 설정
        const targetX = (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x;
        const targetY = -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y);
        const targetPosition = new BABYLON.Vector3(targetX, targetY, 0);


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
    // PUBLIC: showSolvedView – 즉시 복귀 및 Controls 해제 (카메라 초기화 및 컨트롤 해제 개선)
    // --------------------------------------------------------------------
    FoldEngine.showSolvedView = function (sec = 0.0) {
        return new Promise(resolve => {

            // 펼쳐진 2D 상태로 즉시 복귀
            layoutFlat2D(); 
            
            // 카메라 시점 초기화 (정면 뷰)
            camera.radius = 8;
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2;

            // ⭐ 개선: 전개도의 중심을 정확히 타겟으로 설정
            const targetX = (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x;
            const targetY = -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y);
            const targetPosition = new BABYLON.Vector3(targetX, targetY, 0);

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
