/**
 * FoldEngine.js – Perfect Cube Folding Engine (Final Clean Version)
 * 정육면체 전개도 전용
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;

    let faceGroups = [];      // THREE.Group (면)
    let facesSorted = [];     // net.faces의 id 정렬본
    let adj = [];             // adjacency (index 기반)
    let foldParent = [];      // BFS tree (index 기반)
    let initialMatrices = []; // unfold 좌표계 저장

    FoldEngine.currentNet = null;

    const EPS = 1e-6;

    // ===============================
    // INIT THREE
    // ===============================
    FoldEngine.init = function (canvas) {
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        }
        renderer.setSize(canvas.width, canvas.height);

        if (!scene) {
            scene = new THREE.Scene();
            FoldEngine.scene = scene;
        } else {
            while (scene.children.length > 0) scene.remove(scene.children[0]);
        }

        const aspect = canvas.width / canvas.height;
        camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
        camera.position.set(0, 0, 7);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.9));

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);
    };

    // ===============================
    // CREATE GEOMETRY (정육면체 전용)
    // ===============================
    function createFaceGeometry() {
        const g = new THREE.Geometry();
        g.vertices.push(
            new THREE.Vector3(-0.5, -0.5, 0),
            new THREE.VectorVector3(0.5, -0.5, 0),
            new THREE.Vector3(0.5, 0.5, 0),
            new THREE.Vector3(-0.5, 0.5, 0)
        );
        g.faces.push(new THREE.Face3(0, 1, 2));
        g.faces.push(new THREE.Face3(0, 2, 3));
        g.computeFaceNormals();
        return g;
    }

    // ===============================
    // BUILD ADJACENCY (index 기반)
    // ===============================
    function buildAdjacency() {
        const N = facesSorted.length;
        adj = [...Array(N)].map(() => []);

        function edges(f) {
            return [
                { a: [f.u, f.v], b: [f.u + 1, f.v] },
                { a: [f.u + 1, f.v], b: [f.u + 1, f.v + 1] },
                { a: [f.u + 1, f.v + 1], b: [f.u, f.v + 1] },
                { a: [f.u, f.v + 1], b: [f.u, f.v] }
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
                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (sameEdge(Ei[ei], Ej[ej])) {
                            adj[i].push({ to: j, edgeA: ei, edgeB: ej });
                            adj[j].push({ to: i, edgeA: ej, edgeB: ei });
                        }
                    }
                }
            }
        }
    }

    // ===============================
    // BUILD BFS TREE
    // ===============================
    function buildTree() {
        const N = facesSorted.length;
        foldParent = Array(N).fill(null);

        const root = 0;
        foldParent[root] = -1;

        const Q = [root];

        while (Q.length) {
            const f = Q.shift();
            adj[f].forEach(rel => {
                if (foldParent[rel.to] === null) {
                    foldParent[rel.to] = f;
                    Q.push(rel.to);
                }
            });
        }
    }

    // ===============================
    // LOAD NET
    // ===============================
    FoldEngine.loadNet = function (net) {
        FoldEngine.currentNet = net;

        facesSorted = [...net.faces].sort((a, b) => a.id - b.id);
        faceGroups = [];
        initialMatrices = [];

        // faceGroups 생성
        facesSorted.forEach(f => {
            const g = new THREE.Group();
            const geom = createFaceGeometry();
            const mesh = new THREE.Mesh(
                geom,
                new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
            );

            const edgeGeom = new THREE.EdgesGeometry(geom);
            const line = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({ color: 0x333333 }));

            g.add(mesh);
            g.add(line);

            g.position.set(f.u, -f.v, 0);
            g.updateMatrixWorld(true);

            scene.add(g);
            faceGroups.push(g);
        });

        scene.updateMatrixWorld(true);

        buildAdjacency();
        buildTree();

        // unfold 좌표 저장
        faceGroups.forEach(g => {
            initialMatrices.push(g.matrixWorld.clone());
        });

        return Promise.resolve();
    };

    // ===============================
    // UNFOLD IMMEDIATE
    // ===============================
    FoldEngine.unfoldImmediate = function () {
        faceGroups.forEach((g, i) => {
            g.matrix.copy(initialMatrices[i]);
            g.matrixWorld.copy(initialMatrices[i]);
        });
        renderer.render(scene, camera);
    };

    // ===============================
    // ROTATE CHILD (행렬 기반)
    // ===============================
    function rotateChild(parentIdx, childIdx, angle) {
        const rel = adj[parentIdx].find(r => r.to === childIdx);
        if (!rel) return;

        const face = facesSorted[parentIdx];
        const A = new THREE.Vector3(
            face.u + (rel.edgeA === 0 || rel.edgeA === 3 ? 0 : 1),
            -(face.v + (rel.edgeA === 0 || rel.edgeA === 1 ? 0 : 1)),
            0
        );
        const B = new THREE.Vector3(
            face.u + (rel.edgeA === 0 || rel.edgeA === 1 ? 1 : 0),
            -(face.v + (rel.edgeA === 1 || rel.edgeA === 2 ? 1 : 0)),
            0
        );

        // parent transform
        const parentMat = initialMatrices[parentIdx];
        const Aw = A.clone().applyMatrix4(parentMat);
        const Bw = B.clone().applyMatrix4(parentMat);

        const axis = Bw.clone().sub(Aw).normalize();

        const pivot = Aw;
        const childMat0 = initialMatrices[childIdx];

        // M_child = T(p) * R(axis,angle) * T(-p) * M_child0
        const T1 = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);
        const R = new THREE.Matrix4().makeRotationAxis(axis, angle);
        const T2 = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);

        const M = new THREE.Matrix4();
        M.multiplyMatrices(T1, R);
        M.multiply(T2);
        M.multiply(childMat0);

        faceGroups[childIdx].matrix.copy(M);
        faceGroups[childIdx].matrixWorld.copy(M);
    }

    // ===============================
    // FOLD ANIMATE
    // ===============================
    FoldEngine.foldAnimate = function (sec = 1) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const angle = prog * (Math.PI / 2);

                // reset
                faceGroups.forEach((g, i) => {
                    g.matrix.copy(initialMatrices[i]);
                    g.matrixWorld.copy(initialMatrices[i]);
                });

                for (let i = 0; i < facesSorted.length; i++) {
                    const p = foldParent[i];
                    if (p === -1) continue;
                    rotateChild(p, i, angle);
                }

                renderer.render(scene, camera);

                if (prog < 1) requestAnimationFrame(step);
                else resolve();
            }

            requestAnimationFrame(step);
        });
    };

    // ===============================
    // SHOW SOLVED VIEW
    // ===============================
    FoldEngine.showSolvedView = function (sec = 1.5) {
        return new Promise(resolve => {
            const start = performance.now();

            function step(t) {
                const prog = Math.min(1, (t - start) / (sec * 1000));
                const th = prog * (Math.PI / 4);

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
