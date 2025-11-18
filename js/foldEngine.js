/**
 * foldEngine.js – ⭐ 모서리 인덱스 및 좌표계 일관성 최종 확보 버전 ⭐
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
    let netCenter = { x: 0, y: 0 }; // 2D 평면 기준 중심

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
    // 공통 렌더 루프
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

        // 탑 뷰 (Top View) 설정: XZ 평면을 위에서 내려다보는 시점
        camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI / 2, 0, 8, BABYLON.Vector3.Zero(), scene);
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
    // 3D 단위 면 생성 ( Plane을 XZ 평면에 눕히는 회전 유지)
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        const plane = BABYLON.MeshBuilder.CreatePlane("face" + faceId, { width: 1, height: 1, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        
        plane.material = createFaceMaterial(scene, getFaceColorById(faceId));
        const g = new BABYLON.TransformNode("group" + faceId, scene);
        plane.parent = g;
        
        // Plane을 XZ 평면에 눕힘 (Y=0)
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
    // 2D 평면 배치 (Z축 반전 로직 재검토)
    // --------------------------------------------------------------------
    function layoutFlat2D() {
        const N = facesSorted.length;
        if (!N) return;

        const rootFace = facesSorted[0];
        const rootX = (rootFace.u + rootFace.w / 2) - netCenter.x;
        // Z 좌표: 2D V - Net Center Y에 반전 적용.
        const rootZ = -((rootFace.v + rootFace.h / 2) - netCenter.y);

        const worldPos = [];
        const worldRot = [];

        worldPos[0] = new BABYLON.Vector3(rootX, 0, rootZ); // Y=0 (XZ 평면)
        worldRot[0] = new BABYLON.Quaternion();

        nodes[0].position.copyFrom(worldPos[0]);
        nodes[0].rotationQuaternion = worldRot[0];

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
                    const dz = -(cCy - pCy); // Z축 (V축) 변위도 반전 적용

                    worldPos[i] = new BABYLON.Vector3(
                        worldPos[p].x + dx,
                        0, 
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
    // hinge 정보 구성 (모서리 인덱스 최종 수정)
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        // 3D XZ 로컬 좌표 (Top View에서 2D와 같은 모양이 나오도록 배치)
        // 2D V축을 3D -Z축으로 매핑합니다.
        const corners = [
            new BABYLON.Vector3(-0.5, 0, -0.5), // A: Left Top
            new BABYLON.Vector3(0.5, 0, -0.5),  // B: Right Top
            new BABYLON.Vector3(0.5, 0, 0.5),   // C: Right Bottom
            new BABYLON.Vector3(-0.5, 0, 0.5)   // D: Left Bottom
        ];

        for (let i = 1; i < N; i++) {
            const p = parentOf[i];
            if (p === -1 || p === null) continue;

            const rel = adjacency[p].find(r => r.to === i);
            if (!rel) continue;

            const edgeId = rel.edgeA;
            let A, B;

            switch (edgeId) {
                // 2D 인덱스 0번 모서리: (u, v) -> (u+w, v) (Babylon XZ에서 Z=-0.5 모서리)
                case 0: A = corners[0]; B = corners[1]; break; 
                // 2D 인덱스 1번 모서리: (u+w, v) -> (u+w, v+h) (Babylon XZ에서 X=0.5 모서리)
                case 1: A = corners[1]; B = corners[2]; break; 
                // 2D 인덱스 2번 모서리: (u+w, v+h) -> (u, v+h) (Babylon XZ에서 Z=0.5 모서리)
                case 2: A = corners[2]; B = corners[3]; break; 
                // 2D 인덱스 3번 모서리: (u, v+h) -> (u, v) (Babylon XZ에서 X=-0.5 모서리)
                case 3: A = corners[3]; B = corners[0]; break; 
                default: continue;
            }

            const f = facesSorted[i];
            const pf = facesSorted[p];

            const dx = (f.u + f.w / 2) - (pf.u + pf.w / 2);
            const dz = -((f.v + f.h / 2) - (pf.v + pf.h / 2)); // Z축 반전 유지

            hingeInfo[i] = {
                parent: p,
                A_local: A.clone(),
                axis_local: B.subtract(A).normalize(),
                childCenter_local: new BABYLON.Vector3(dx, 0, dz)
            };
        }
    }


    // --------------------------------------------------------------------
    // 접힘 계산 applyFolding(angle) (오류 방지 로직 유지)
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = []; 
        const Pw = []; 

        Pw[0] = new BABYLON.Vector3(
            (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x,
            0,
            -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y) 
        );
        Qw[0] = new BABYLON.Quaternion();

        const Q = [0]; 

        while (Q.length) {
            const p = Q.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    
                    // 오류 방지 로직
                    if (!info || !info.axis_local) { 
                         Q.push(i);
                         continue; 
                    }

                    const parentQ = Qw[p];
                    const parentP = Pw[p];

                    const qLocal = BABYLON.Quaternion.RotationAxis(
                        info.axis_local,
                        angle
                    );

                    let r0 = info.childCenter_local.clone().subtract(info.A_local);

                    r0 = BABYLON.Vector3.TransformCoordinates(r0, qLocal.toRotationMatrix()); 

                    const cLocal = info.A_local.clone().add(r0);

                    let cWorld = cLocal.clone().rotateByQuaternionToRef(parentQ, new BABYLON.Vector3());
                    cWorld = cWorld.add(parentP);

                    Pw[i] = cWorld;
                    Qw[i] = parentQ.multiply(qLocal);

                    Q.push(i);
                }
            }
        }

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
        camera.alpha = -Math.PI / 2; 
        camera.beta = 0;             
        
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
                const angle = prog * (Math.PI / 2); 

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

            resolve(); 

        });
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldStaticTo (validator 전용 – 즉시 특정 각도로 접기)
    // --------------------------------------------------------------------
    FoldEngine.foldStaticTo = function (angleRad) {
        applyFolding(angleRad);
    };


})();
