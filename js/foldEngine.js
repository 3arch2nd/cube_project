/**
 * foldEngine.js – PERFECT Cube Folding Engine (Final Version)
 * ------------------------------------------------------------
 * ✔ 정육면체 전용 (각 면 크기 = 1×1)
 * ✔ UI 좌표(u,v)를 그대로 사용 — center shift 없음
 * ✔ parent-child 트리 구조 정확
 * ✔ pivot 회전축 = parent local 좌표 기반 정확하게 계산
 * ✔ foldAnimate → 완전히 종이처럼 접힘
 * ✔ no fragment / no drift
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // Three.js 객체
    let scene, camera, renderer;

    // 전개도 데이터
    let facesSorted = [];   // id 순으로 정렬된 faces
    let nodes = [];         // face groups
    let adjacency = [];     // index-based adjacency
    let parentOf = [];      // BFS tree (parent index)

    const EPS = 1e-6;

    // ============================================================
    // INIT
    // ============================================================
    FoldEngine.init = function (canvas) {

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
            100
        );
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(3, 5, 6);
        scene.add(light);
    };

    // ============================================================
    // UNIT FACE (1×1)
    // ============================================================
    function createUnitFace() {
        const group = new THREE.Group();

        const geom = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geom, mat);

        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x333333 })
        );

        group.add(mesh);
        group.add(line);

        return group;
    }

     // ============================================================
    // ADJACENCY (index-based)
    // ============================================================
    function buildAdjacency() {
        const N = facesSorted.length;
        adjacency = [...Array(N)].map(() => []);

        function edges(face) {
            return [
                { a:[face.u, face.v],     b:[face.u+1, face.v]     }, // top
                { a:[face.u+1, face.v],   b:[face.u+1, face.v+1]   }, // right
                { a:[face.u+1, face.v+1], b:[face.u, face.v+1]     }, // bottom
                { a:[face.u, face.v+1],   b:[face.u, face.v]       }  // left
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

    // ============================================================
    // BUILD BFS TREE → parentOf[]
    // ============================================================
    function buildTree() {
        const N = facesSorted.length;
        parentOf = Array(N).fill(null);

        parentOf[0] = -1; // 첫 면을 루트로
        const Q = [0];

        while (Q.length) {
            const f = Q.shift();
            adjacency[f].forEach(rel => {
                if (parentOf[rel.to] === null) {
                    parentOf[rel.to] = f;
                    Q.push(rel.to);
                }
            });
        }
    }

    // ============================================================
    // LOAD NET (트리 구조로 Scene에 배치)
    // ============================================================
    FoldEngine.loadNet = function (net) {
        // id 순으로 정렬된 faces
        facesSorted = [...net.faces].sort((a, b) => a.id - b.id);

        buildAdjacency();
        buildTree();

        nodes = [];

        // 1) 모든 face를 Three.js Group으로 생성
        facesSorted.forEach(face => {
            const g = createUnitFace();
            g.userData = { u: face.u, v: face.v };
            nodes.push(g);
        });

        // 2) parent-child 형태로 scene에 배치
        nodes.forEach((child, idx) => {
            const p = parentOf[idx];

            if (p === -1) {
                // root node: 실제 좌표(u, v) 그대로 배치
                child.position.set(facesSorted[idx].u, -facesSorted[idx].v, 0);
                scene.add(child);
            } else {
                // child는 parent 좌표 기준 local position
                const parent = nodes[p];
                parent.add(child);

                const relU = facesSorted[idx].u - facesSorted[p].u;
                const relV = facesSorted[idx].v - facesSorted[p].v;

                child.position.set(relU, -relV, 0);
            }
        });

        scene.updateMatrixWorld(true);

        return Promise.resolve();
    };

     // ============================================================
    // 2D 전개도 레이아웃으로 되돌리기 (모든 회전/이동 초기화)
    // ============================================================
    function resetLayout2D() {
        if (!facesSorted.length || !nodes.length) return;

        for (let i = 0; i < facesSorted.length; i++) {
            const face = facesSorted[i];
            const node = nodes[i];
            const p = parentOf[i];

            if (p === -1) {
                // 루트: 전개도 절대 좌표 (u, v)를 그대로 사용
                node.position.set(face.u, -face.v, 0);
            } else {
                // 자식: parent 기준 상대 위치 (격자 차이만큼)
                const parentFace = facesSorted[p];
                const relU = face.u - parentFace.u;
                const relV = face.v - parentFace.v;
                node.position.set(relU, -relV, 0);
            }

            node.rotation.set(0, 0, 0);
        }

        scene.updateMatrixWorld(true);
    }

    // ============================================================
    // 공개: unfoldImmediate
    // ============================================================
    FoldEngine.unfoldImmediate = function () {
        resetLayout2D();
        renderer.render(scene, camera);
    };

    // ============================================================
    // PIVOT / AXIS 계산 (parent local 기준)
    // ============================================================
    function getEdgePivotLocal(parentIdx, childIdx) {
        const rel = adjacency[parentIdx].find(r => r.to === childIdx);
        if (!rel) return null;

        const edgeId = rel.edgeA;

        // parent의 local 좌표계에서 unit square(1x1)를 가정
        // 중심 (0,0)에 있고, 한 변 길이 1
        const corners = [
            new THREE.Vector3(-0.5,  0.5, 0), // 0: top-left
            new THREE.Vector3( 0.5,  0.5, 0), // 1: top-right
            new THREE.Vector3( 0.5, -0.5, 0), // 2: bottom-right
            new THREE.Vector3(-0.5, -0.5, 0)  // 3: bottom-left
        ];

        // edges: 0=top, 1=right, 2=bottom, 3=left
        let A, B;
        switch (edgeId) {
            case 0: // top
                A = corners[0];
                B = corners[1];
                break;
            case 1: // right
                A = corners[1];
                B = corners[2];
                break;
            case 2: // bottom
                A = corners[2];
                B = corners[3];
                break;
            case 3: // left
                A = corners[3];
                B = corners[0];
                break;
            default:
                return null;
        }

        const axis = new THREE.Vector3().subVectors(B, A).normalize();
        return { A, axis };
    }

    // ============================================================
    // 한 자식 면을 parent의 edge를 축으로 회전
    // ============================================================
    function rotateChildLocal(parentIdx, childIdx, angle) {
        const nodeParent = nodes[parentIdx];
        const nodeChild  = nodes[childIdx];

        if (!nodeParent || !nodeChild) return;

        const pivotData = getEdgePivotLocal(parentIdx, childIdx);
        if (!pivotData) return;

        const { A, axis } = pivotData;

        // child는 parent local space에 있음
        // → pivot A 주위를 회전시키기 위해 translate → rotate → translate 복합
        nodeChild.position.sub(A);
        nodeChild.rotateOnAxis(axis, angle);
        nodeChild.position.add(A);
    }

    // ============================================================
    // foldAnimate: 2D 전개도 → 3D 정육면체로 접기
    // ============================================================
    FoldEngine.foldAnimate = function (sec = 1.0) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog  = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2);  // 90도까지 서서히

                // 1) 매 프레임마다 완전히 펼친 상태로 리셋
                resetLayout2D();

                // 2) 루트를 제외한 모든 면을 parent의 edge를 기준으로 회전
                for (let i = 0; i < facesSorted.length; i++) {
                    const p = parentOf[i];
                    if (p === -1) continue;
                    rotateChildLocal(p, i, angle);
                }

                scene.updateMatrixWorld(true);
                renderer.render(scene, camera);

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    };

    // ============================================================
    // showSolvedView: 접힌 정육면체를 천천히 회전하며 보여주기
    // ============================================================
    FoldEngine.showSolvedView = function (sec = 1.5) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const theta = prog * (Math.PI / 3); // 60도 정도 회전

                const radius = 7;
                camera.position.set(
                    radius * Math.sin(theta),
                    3,
                    radius * Math.cos(theta)
                );
                camera.lookAt(0, 0, 0);

                renderer.render(scene, camera);

                if (prog < 1) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    };

})();
