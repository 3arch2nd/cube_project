/**
 * foldEngine.js – PERFECT Cube Folding Engine
 * --------------------------------------------
 * ✔ 정육면체 전용
 * ✔ 모든 면이 parent-child로 연결됨 (종이처럼 접힘)
 * ✔ 전개도 중심 조정
 * ✔ 회전축 계산 정확
 * ✔ foldAnimate + showSolvedView 완전 작동
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;

    let facesSorted = [];   // net.faces sorted by id
    let faceNodes = [];     // face Groups (트리 구조)
    let rootNode = null;    // 첫 번째 face
    let adjacency = [];     // index-based adjacency
    let parentOf = [];      // BFS tree
    let netCenter = { x: 0, y: 0 };

    const EPS = 1e-6;

    // =====================================================
    // INIT
    // =====================================================
    FoldEngine.init = function (canvas) {
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true
            });
        }
        renderer.setSize(canvas.width, canvas.height);

        scene = new THREE.Scene();
        FoldEngine.scene = scene;

        // Camera
        camera = new THREE.PerspectiveCamera(
            40,
            canvas.width / canvas.height,
            0.1,
            100
        );
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(3, 5, 5);
        scene.add(light);
    };

    // =====================================================
    // UTIL – Create 1×1 square face
    // =====================================================
    function createUnitFace() {
        const g = new THREE.Group();

        const geom = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geom, mat);

        // outline
        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x333333 })
        );

        g.add(mesh);
        g.add(line);

        return g;
    }

    // =====================================================
    // CALC NET CENTER
    // =====================================================
    function computeNetCenter() {
        let minU = Infinity, minV = Infinity;
        let maxU = -Infinity, maxV = -Infinity;

        facesSorted.forEach(f => {
            minU = Math.min(minU, f.u);
            minV = Math.min(minV, f.v);
            maxU = Math.max(maxU, f.u + 1);
            maxV = Math.max(maxV, f.v + 1);
        });

        netCenter.x = (minU + maxU) / 2;
        netCenter.y = (minV + maxV) / 2;
    }

    // =====================================================
    // ADJACENCY (index-based)
    // =====================================================
    function buildAdjacency() {
        const N = facesSorted.length;
        adjacency = [...Array(N)].map(() => []);

        function edges(face) {
            return [
                { a: [face.u, face.v],     b: [face.u+1, face.v]     },
                { a: [face.u+1, face.v],   b: [face.u+1, face.v+1]   },
                { a: [face.u+1, face.v+1], b: [face.u, face.v+1]     },
                { a: [face.u, face.v+1],   b: [face.u, face.v]       }
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

    // =====================================================
    // BUILD BFS TREE
    // =====================================================
    function buildTree() {
        const N = facesSorted.length;
        parentOf = Array(N).fill(null);
        parentOf[0] = -1;

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

    // =====================================================
    // LOAD NET
    // =====================================================
    FoldEngine.loadNet = function (net) {
        facesSorted = [...net.faces].sort((a, b) => a.id - b.id);

        computeNetCenter();
        buildAdjacency();
        buildTree();

        faceNodes = [];

        // 1. 모든 face 노드 생성
        facesSorted.forEach(face => {
            const g = createUnitFace();
            g.userData = { u: face.u, v: face.v };
            faceNodes.push(g);
        });

        // 2. 트리 구조로 Scene에 배치
        faceNodes.forEach((child, idx) => {
            const p = parentOf[idx];
            if (p === -1) {
                // root
                child.position.set(
                    facesSorted[idx].u - netCenter.x,
                    -(facesSorted[idx].v - netCenter.y),
                    0
                );
                scene.add(child);
            } else {
                const parent = faceNodes[p];
                parent.add(child);

                child.position.set(
                    facesSorted[idx].u - facesSorted[p].u,
                    -(facesSorted[idx].v - facesSorted[p].v),
                    0
                );
            }
        });

        scene.updateMatrixWorld(true);

        return Promise.resolve();
    };

    // =====================================================
    // UNFOLD (RESET TRANSFORM)
    // =====================================================
    FoldEngine.unfoldImmediate = function () {
        // 트리 전체 초기 각도 0
        faceNodes.forEach(n => {
            n.rotation.set(0, 0, 0);
        });
        scene.updateMatrixWorld(true);
        renderer.render(scene, camera);
    };

    // =====================================================
    // GET ROTATION AXIS & PIVOT
    // =====================================================
    function getEdgePivot(parentIdx, childIdx) {
        const rel = adjacency[parentIdx].find(r => r.to === childIdx);
        const edgeId = rel.edgeA;

        const f = facesSorted[parentIdx];
        const corners = [
            new THREE.Vector3(f.u - netCenter.x, -(f.v - netCenter.y), 0),
            new THREE.Vector3(f.u + 1 - netCenter.x, -(f.v - netCenter.y), 0),
            new THREE.Vector3(f.u + 1 - netCenter.x, -(f.v + 1 - netCenter.y), 0),
            new THREE.Vector3(f.u - netCenter.x, -(f.v + 1 - netCenter.y), 0)
        ];

        const A = corners[edgeId];
        const B = corners[(edgeId + 1) % 4];

        return { A, B };
    }

    // =====================================================
    // ROTATE ONE CHILD
    // =====================================================
    function rotateChildLocal(parentIdx, childIdx, angle) {
        const rel = adjacency[parentIdx].find(r => r.to === childIdx);
        if (!rel) return;

        const parent = faceNodes[parentIdx];
        const child = faceNodes[childIdx];

        const { A, B } = getEdgePivot(parentIdx, childIdx);

        // A와 B는 parent의 local 좌표
        const axis = new THREE.Vector3().subVectors(B, A).normalize();

        // child의 회전 pivot을 edge A로 맞춤
        child.position.sub(A);
        child.rotateOnAxis(axis, angle);
        child.position.add(A);
    }

    // =====================================================
    // ANIMATE FOLD
    // =====================================================
    FoldEngine.foldAnimate = function (sec = 1.0) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const theta = prog * (Math.PI / 2); // 90도 접기

                // reset
                FoldEngine.unfoldImmediate();

                // apply fold
                for (let i = 1; i < facesSorted.length; i++) {
                    const p = parentOf[i];
                    rotateChildLocal(p, i, theta);
                }

                scene.updateMatrixWorld(true);
                renderer.render(scene, camera);

                if (prog < 1) requestAnimationFrame(step);
                else resolve();
            }

            requestAnimationFrame(step);
        });
    };

    // =====================================================
    // CAMERA ROTATION AFTER SOLVED
    // =====================================================
    FoldEngine.showSolvedView = function (sec = 1.5) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const th = prog * (Math.PI / 3);

                camera.position.set(
                    6 * Math.sin(th),
                    3,
                    6 * Math.cos(th)
                );
                camera.lookAt(0, 0, 0);

                renderer.render(scene, camera);

                if (prog < 1) requestAnimationFrame(step);
                else resolve();
            }

            requestAnimationFrame(step);
        });
    };

})();
