/**
 * foldEngine.js – Perfect Cube Folding Engine (Index-Safe Edition)
 * 
 * ✔ face.id가 0~5가 아닐 때도 정상 동작
 * ✔ adjacency는 index 기반
 * ✔ unfoldImmediate() 복구
 */

(function () {
    "use strict";

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;
    let faceGroups = [];
    let facesSorted = [];
    let adj = [];
    let foldParent = [];

    FoldEngine.currentNet = null;

    // -------------------------
    // Init Three.js
    // -------------------------
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

    // -------------------------
    // Geometry
    // -------------------------
    function createGeom() {
        const g = new THREE.Geometry();
        g.vertices.push(
            new THREE.Vector3(-0.5, -0.5, 0),
            new THREE.Vector3(0.5, -0.5, 0),
            new THREE.Vector3(0.5, 0.5, 0),
            new THREE.Vector3(-0.5, 0.5, 0)
        );
        g.faces.push(new THREE.Face3(0,1,2));
        g.faces.push(new THREE.Face3(0,2,3));
        g.computeFaceNormals();
        return g;
    }

    // -------------------------
    // Build adjacency by INDEX
    // -------------------------
    function buildAdjacency() {
        const N = facesSorted.length;
        adj = [...Array(N)].map(()=>[]);

        function edges(face) {
            return [
                { a:[face.u, face.v], b:[face.u+1, face.v] },
                { a:[face.u+1, face.v], b:[face.u+1, face.v+1] },
                { a:[face.u+1, face.v+1], b:[face.u, face.v+1] },
                { a:[face.u, face.v+1], b:[face.u, face.v] }
            ];
        }

        function sameEdge(e1, e2) {
            return (
                Math.abs(e1.a[0]-e2.b[0]) < 1e-6 &&
                Math.abs(e1.a[1]-e2.b[1]) < 1e-6 &&
                Math.abs(e1.b[0]-e2.a[0]) < 1e-6 &&
                Math.abs(e1.b[1]-e2.a[1]) < 1e-6
            );
        }

        for (let i=0;i<N;i++) {
            const Ei = edges(facesSorted[i]);
            for (let j=i+1;j<N;j++) {
                const Ej = edges(facesSorted[j]);
                for (let ei=0;ei<4;ei++) {
                    for (let ej=0;ej<4;ej++) {
                        if (sameEdge(Ei[ei], Ej[ej])) {
                            adj[i].push({ to:j, edgeA:ei, edgeB:ej });
                            adj[j].push({ to:i, edgeA:ej, edgeB:ei });
                        }
                    }
                }
            }
        }
    }

    // -------------------------
    // Build folding tree index-based
    // -------------------------
    function buildTree() {
        const N = facesSorted.length;
        foldParent = Array(N).fill(null);

        const root = 0;
        foldParent[root] = -1;

        const Q = [root];
        const order = [];

        while (Q.length) {
            const f = Q.shift();
            order.push(f);

            adj[f].forEach(rel => {
                if (foldParent[rel.to] === null) {
                    foldParent[rel.to] = f;
                    Q.push(rel.to);
                }
            });
        }

        return order;
    }

    // -------------------------
    // Load Net
    // -------------------------
    FoldEngine.loadNet = function (net) {
        FoldEngine.currentNet = net;

        facesSorted = [...net.faces].sort((a,b)=>a.id-b.id);

        // create face groups
        faceGroups = [];
        facesSorted.forEach(face => {
            const g = new THREE.Group();
            g.userData.face = face;

            const geom = createGeom();
            const mesh = new THREE.Mesh(
                geom,
                new THREE.MeshLambertMaterial({ color:0xffffff, side:THREE.DoubleSide })
            );

            const edgeGeom = new THREE.EdgesGeometry(geom);
            const line = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({ color:0x333333 }));

            g.add(mesh);
            g.add(line);

            // initial pos = uv
            g.position.set(face.u, -face.v, 0);
            g.updateMatrix();

            scene.add(g);
            faceGroups.push(g);
        });

        scene.updateMatrixWorld(true);

        // build adj + tree
        buildAdjacency();
        const order = buildTree();

        // parent-child relink (index-based)
        for (let i=0;i<facesSorted.length;i++) {
            const p = foldParent[i];
            if (p === -1) continue;

            const parentGroup = faceGroups[p];
            const childGroup  = faceGroups[i];
            scene.remove(childGroup);
            parentGroup.add(childGroup);
        }

        scene.updateMatrixWorld(true);

        return Promise.resolve();
    };

    // -------------------------
    // Unfold immediate (all rotations 0)
    // -------------------------
    FoldEngine.unfoldImmediate = function () {
        faceGroups.forEach(g => {
            g.rotation.set(0,0,0);
            g.updateMatrixWorld(true);
        });
        renderer.render(scene, camera);
    };

    // -------------------------
    // Fold one child
    // -------------------------
    function rotateChild(parentIdx, childIdx, angle) {
        const parent = faceGroups[parentIdx];
        const child  = faceGroups[childIdx];

        const rel = adj[parentIdx].find(r => r.to === childIdx);
        if (!rel) return;

        const f = rel.edgeA;
        const face = facesSorted[parentIdx];

        const corners = [
            [face.u, face.v],
            [face.u+1, face.v],
            [face.u+1, face.v+1],
            [face.u, face.v+1]
        ];

        const A = new THREE.Vector3(corners[f][0], -corners[f][1], 0);
        const B = new THREE.Vector3(corners[(f+1)%4][0], -corners[(f+1)%4][1], 0);

        parent.updateMatrixWorld(true);
        child.updateMatrixWorld(true);

        const Aw = A.clone().applyMatrix4(parent.matrixWorld);
        const Bw = B.clone().applyMatrix4(parent.matrixWorld);
        const axis = Bw.clone().sub(Aw).normalize();

        child.rotateOnWorldAxis(axis, angle);
    }

    // -------------------------
    // foldAnimate
    // -------------------------
    FoldEngine.foldAnimate = function (sec=1) {
        return new Promise(resolve => {
            const start = performance.now();
            const N = facesSorted.length;

            function step(t) {
                const prog = Math.min(1, (t-start)/(sec*1000));
                const angle = prog * (Math.PI/2);

                // reset
                faceGroups.forEach(g => { g.rotation.set(0,0,0); });
                scene.updateMatrixWorld(true);

                // fold in tree order
                for (let i=0;i<N;i++) {
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

    // -------------------------
    // showSolvedView
    // -------------------------
    FoldEngine.showSolvedView = function(sec=1.5) {
        return new Promise(resolve=>{
            const start = performance.now();

            function step(t){
                const prog = Math.min(1,(t-start)/(sec*1000));
                const th = prog * (Math.PI/4);

                camera.position.set(
                    6 * Math.sin(th),
                    3,
                    6 * Math.cos(th)
                );
                camera.lookAt(0,0,0);

                renderer.render(scene,camera);

                if(prog<1) requestAnimationFrame(step);
                else resolve();
            }
            requestAnimationFrame(step);
        });
    };

})();
