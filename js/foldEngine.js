/**
 * foldEngine.js – 최신 안정 버전 + 반투명 + OrbitControls
 * 정육면체 전개도 → 3D 접기 / 검증용 엔진
 * ------------------------------------------------------------
 * UI.js / validator.js 와 완전 호환 버전
 *
 * ⚙ 추가사항
 *  - 3D 면 재질을 약간 반투명(opacity 0.75)으로 변경
 *  - OrbitControls로 마우스 드래그 회전 가능
 *    · 중심(0,0,0) 고정
 *    · enableDamping = true, enablePan = false
 *    · 자동 회전(showSolvedView) 중에는 컨트롤 잠시 정지 후, 끝나면 다시 활성
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // ------------------------------------------------------------
    // THREE 기본 객체
    // ------------------------------------------------------------
    let scene = null;
    let camera = null;
    let renderer = null;

    // OrbitControls
    let controls = null;
    let animationStarted = false;
    let isAutoCameraMoving = false;   // showSolvedView 동안 true

    // ------------------------------------------------------------
    // 전개도 데이터
    // ------------------------------------------------------------
    let facesSorted = [];     // id 순 정렬된 faces
    let adjacency = [];       // face 인접 정보
    let parentOf = [];        // BFS parent
    let hingeInfo = [];       // parent-child 힌지 정보
    let netCenter = { x: 0, y: 0 };

    let nodes = [];           // THREE.Group (각 면)

    const EPS = 1e-6;

    // ------------------------------------------------------------
    // 색상 (진하게)
    // ------------------------------------------------------------
    const FACE_COLORS = [
        0xff4d4d,  // 빨
        0xffd43b,  // 노
        0x51cf66,  // 초
        0x339af0,  // 파
        0x845ef7,  // 보
        0xf06595   // 분홍
    ];

    // ------------------------------------------------------------
    // 외부에서 필요로 하는 getter
    // ------------------------------------------------------------
    FoldEngine.getFaceGroups = function () {
        return nodes;
    };
    FoldEngine.scene = scene; // validator / overlap 용

    // ------------------------------------------------------------
    // 내부: 공통 렌더 루프 시작
    // ------------------------------------------------------------
    function startBaseLoop() {
        if (animationStarted || !renderer || !scene || !camera) return;
        animationStarted = true;

        function loop() {
            requestAnimationFrame(loop);

            // 자동 카메라 이동 중에는 OrbitControls update 중지
            if (controls && !isAutoCameraMoving) {
                controls.update();
            }

            renderer.render(scene, camera);
        }

        requestAnimationFrame(loop);
    }

    // --------------------------------------------------------------------
    // INIT
    // --------------------------------------------------------------------
    FoldEngine.init = function (canvas) {
        if (!canvas) {
            console.warn("[FoldEngine.init] canvas is null");
            return;
        }

        if (!renderer) {
            renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true
            });
        }
        renderer.setSize(canvas.width, canvas.height);

        scene = new THREE.Scene();
        FoldEngine.scene = scene;

        camera = new THREE.PerspectiveCamera(
            40,
            canvas.width / canvas.height,
            0.1,
            200
        );
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);

        const amb = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(amb);
        const dir = new THREE.DirectionalLight(0xffffff, 1);
        dir.position.set(4, 5, 6);
        scene.add(dir);

        // OrbitControls 세팅 (전역 THREE.OrbitControls가 있다고 가정)
        if (window.THREE && THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.enablePan = false;          // 패닝 비활성화
            controls.target.set(0, 0, 0);        // 중심 고정
            controls.update();
        } else {
            controls = null; // 없으면 그냥 컨트롤 없이 렌더만
        }

        // 공통 렌더 루프 시작
        startBaseLoop();
    };


    // --------------------------------------------------------------------
    // 유틸: face 색 가져오기
    // --------------------------------------------------------------------
    function getFaceColorById(id) {
        return FACE_COLORS[id % FACE_COLORS.length];
    }

    // --------------------------------------------------------------------
    // 3D face 생성 (반투명 재질)
    // --------------------------------------------------------------------
    function createUnitFace(faceId) {
        const g = new THREE.Group();

        const geom = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshLambertMaterial({
            color: getFaceColorById(faceId),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,         // 살짝 비치는 정도
            depthWrite: true,
            depthTest: true
        });
        const mesh = new THREE.Mesh(geom, mat);

        // 선명한 테두리
        const edges = new THREE.EdgesGeometry(geom);
        const edgeLine = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
                color: 0x000000,
                linewidth: 2
            })
        );

        g.add(mesh);
        g.add(edgeLine);

        g.userData.isCubeFace = true;
        g.userData.faceId = faceId;

        return g;
    }


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
            return (
                Math.abs(e1.a[0] - e2.b[0]) < EPS &&
                Math.abs(e1.a[1] - e2.b[1]) < EPS &&
                Math.abs(e1.b[0] - e2.a[0]) < EPS &&
                Math.abs(e1.b[1] - e2.a[1]) < EPS
            );
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
    // BFS parent 트리 구성
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
    // 이전 faces 제거
    // --------------------------------------------------------------------
    function clearOldFacesFromScene() {
        nodes.forEach(g => {
            if (g && g.parent) g.parent.remove(g);
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
        const rootY = -((rootFace.v + rootFace.h / 2) - netCenter.y);

        const worldPos = [];
        const worldRot = [];

        worldPos[0] = new THREE.Vector3(rootX, rootY, 0);
        worldRot[0] = new THREE.Quaternion();

        nodes[0].position.copy(worldPos[0]);
        nodes[0].quaternion.copy(worldRot[0]);

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

                    const dx = (cCx - pCx);
                    const dy = -(cCy - pCy);

                    worldPos[i] = new THREE.Vector3(
                        worldPos[p].x + dx,
                        worldPos[p].y + dy,
                        0
                    );
                    worldRot[i] = new THREE.Quaternion();

                    nodes[i].position.copy(worldPos[i]);
                    nodes[i].quaternion.copy(worldRot[i]);

                    Q.push(i);
                }
            }
        }

        scene.updateMatrixWorld(true);
    }


    // --------------------------------------------------------------------
    // hinge 정보 구성
    // --------------------------------------------------------------------
    function buildHingeInfo() {
        const N = facesSorted.length;
        hingeInfo = Array(N).fill(null);

        const corners = [
            new THREE.Vector3(-0.5,  0.5, 0),
            new THREE.Vector3( 0.5,  0.5, 0),
            new THREE.Vector3( 0.5, -0.5, 0),
            new THREE.Vector3(-0.5, -0.5, 0)
        ];

        for (let i = 1; i < N; i++) {
            const p = parentOf[i];
            if (p === -1 || p === null) continue;

            const rel = adjacency[p].find(r => r.to === i);
            if (!rel) continue;

            const edge = rel.edgeA;
            let A, B;

            switch (edge) {
                case 0: A = corners[0]; B = corners[1]; break;
                case 1: A = corners[1]; B = corners[2]; break;
                case 2: A = corners[2]; B = corners[3]; break;
                case 3: A = corners[3]; B = corners[0]; break;
            }

            const f  = facesSorted[i];
            const pf = facesSorted[p];

            const pCx = pf.u + pf.w / 2;
            const pCy = pf.v + pf.h / 2;
            const cCx = f.u + f.w / 2;
            const cCy = f.v + f.h / 2;

            const dx = (cCx - pCx);
            const dy = -(cCy - pCy);

            hingeInfo[i] = {
                parent: p,
                A_local: A.clone(),
                axis_local: new THREE.Vector3().subVectors(B, A).normalize(),
                childCenter_local: new THREE.Vector3(dx, dy, 0)
            };
        }
    }


    // --------------------------------------------------------------------
    // 특정 angle로 접기 적용 (즉시 반영)
    // --------------------------------------------------------------------
    function applyFolding(angle) {
        const N = facesSorted.length;
        if (!N) return;

        const Qw = [], Pw = [];
        Pw[0] = new THREE.Vector3(
            (facesSorted[0].u + facesSorted[0].w / 2) - netCenter.x,
            -((facesSorted[0].v + facesSorted[0].h / 2) - netCenter.y),
            0
        );
        Qw[0] = new THREE.Quaternion();

        const q = [0];
        while (q.length) {
            const p = q.shift();

            for (let i = 0; i < N; i++) {
                if (parentOf[i] === p) {
                    const info = hingeInfo[i];
                    if (!info) continue;

                    const parentQ = Qw[p];
                    const parentP = Pw[p];

                    const qLocal = new THREE.Quaternion()
                        .setFromAxisAngle(info.axis_local, angle);

                    const r0 = info.childCenter_local.clone().sub(info.A_local);
                    r0.applyQuaternion(qLocal);
                    const cLocal = info.A_local.clone().add(r0);

                    const cWorld =
                        cLocal.clone().applyQuaternion(parentQ).add(parentP);

                    Pw[i] = cWorld;
                    Qw[i] = parentQ.clone().multiply(qLocal);

                    q.push(i);
                }
            }
        }

        for (let i = 0; i < N; i++) {
            nodes[i].position.copy(Pw[i]);
            nodes[i].quaternion.copy(Qw[i]);
        }

        scene.updateMatrixWorld(true);
    }


    // --------------------------------------------------------------------
    // PUBLIC: 펼쳐진 상태로 즉시 적용
    // --------------------------------------------------------------------
    FoldEngine.unfoldImmediate = function () {
        layoutFlat2D();
        // 렌더는 공통 루프에서 수행
    };


    // --------------------------------------------------------------------
    // PUBLIC: loadNet
    // --------------------------------------------------------------------
    FoldEngine.loadNet = function (net) {
        if (!net || !Array.isArray(net.faces)) {
            console.warn("[FoldEngine.loadNet] invalid net");
            return Promise.resolve();
        }
        if (!scene || !camera || !renderer) {
            console.warn("[FoldEngine.loadNet] init 먼저 필요");
            return Promise.resolve();
        }

        facesSorted = [...net.faces].slice().sort((a, b) => a.id - b.id);

        computeNetCenter();
        buildAdjacency();
        buildTree();
        buildHingeInfo();

        clearOldFacesFromScene();

        nodes = [];
        facesSorted.forEach(face => {
            const g = createUnitFace(face.id);
            nodes.push(g);
            scene.add(g);
        });

        layoutFlat2D();
        // 렌더는 공통 루프에서 수행

        return Promise.resolve();
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldAnimate – 학생용 애니메이션
    // --------------------------------------------------------------------
    FoldEngine.foldAnimate = function (sec = 1.5) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2);

                applyFolding(angle);
                // 렌더는 공통 루프에서 수행

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
    // PUBLIC: showSolvedView – 카메라 자연 회전
    // --------------------------------------------------------------------
    FoldEngine.showSolvedView = function (sec = 1.5) {
        return new Promise(resolve => {
            const start = performance.now();
            isAutoCameraMoving = true;

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));

                const r = 8;
                const theta = prog * (Math.PI * 0.5);

                camera.position.set(
                    r * Math.sin(theta),
                    3,
                    r * Math.cos(theta)
                );

                camera.lookAt(0, 0, 0);
                // 렌더는 공통 루프에서 수행

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
                    // 자동 회전 종료 → OrbitControls 다시 활성
                    isAutoCameraMoving = false;
                    if (controls) {
                        controls.target.set(0, 0, 0);
                        controls.update();
                    }
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    };


    // --------------------------------------------------------------------
    // PUBLIC: foldStaticTo (validator 전용)
    // --------------------------------------------------------------------
    FoldEngine.foldStaticTo = function (angleRad) {
        applyFolding(angleRad);
        // 렌더는 공통 루프에서 수행
    };

})();
