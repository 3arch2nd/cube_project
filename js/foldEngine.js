/**
 * foldEngine.js – Rectangular Prism 확장 버전
 *
 * 지원:
 * - 정육면체 (w=h=1)
 * - 직육면체 (face마다 w,h 다름)
 */

(function () {
    'use strict';

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;
    let faceGroups = [];   // 각 face의 Three.Group
    let parentOf = [];     // folding tree

    const WHITE = 0xffffff;
    const OUTLINE = 0x333333;

    // ---------------------------------------
    //  Three.js 초기화
    // ---------------------------------------
    FoldEngine.init = function (canvas) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(canvas.width, canvas.height);

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(4, 4, 6);
        camera.lookAt(new THREE.Vector3(0, 0, 0));

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);

        const amb = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(amb);
    };

    // ---------------------------------------
    // face geometry 생성 (w × h)
    // ---------------------------------------
    function createFaceGeometry(w, h) {
        const geom = new THREE.Geometry();

        // 중심을 기준으로 w,h만큼 사각형 생성
        const hw = w / 2;
        const hh = h / 2;

        geom.vertices.push(
            new THREE.Vector3(-hw, -hh, 0),
            new THREE.Vector3(hw, -hh, 0),
            new THREE.Vector3(hw, hh, 0),
            new THREE.Vector3(-hw, hh, 0)
        );

        geom.faces.push(new THREE.Face3(0, 1, 2));
        geom.faces.push(new THREE.Face3(0, 2, 3));
        geom.computeFaceNormals();

        return geom;
    }

    // ---------------------------------------
    // 2D 전개도 → 3D face group 생성
    // ---------------------------------------
    FoldEngine.loadNet = function (net) {
        // 리셋
        faceGroups = [];
        while (scene.children.length) scene.remove(scene.children[0]);

        // 카메라/빛 재추가
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));

        // faceGroup 생성
        net.faces.forEach(face => {
            const { id, u, v, w, h } = face;

            const group = new THREE.Group();
            group.faceId = id;

            const geom = createFaceGeometry(w, h);
            const mat = new THREE.MeshLambertMaterial({
                color: WHITE,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geom, mat);

            // outline
            const edges = new THREE.EdgesGeometry(geom);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: OUTLINE }));

            group.add(mesh);
            group.add(line);

            // 전개도 좌표(u,v)에 따른 위치
            // u,v는 "칸" 개념이고 실제 크기는 face.w, face.h
            // u+w/2, v+h/2는 면의 중심 좌표를 의미
            group.position.set(u + w/2, -(v + h/2), 0); // Y축 반전
            group.userData.initialPos = new THREE.Vector3(u + w/2, -(v + h/2), 0);


            scene.add(group);
            faceGroups.push(group);
        });

        // faceGroups를 id 순으로 정렬 (0, 1, 2, ...)
        faceGroups.sort((a, b) => a.faceId - b.faceId);

        renderer.render(scene, camera);
    };

    // ---------------------------------------
    // unfoldImmediate: 단순히 2D 평면에 펼친 상태 유지 (reset)
    // ---------------------------------------
    FoldEngine.unfoldImmediate = function () {
         faceGroups.forEach(group => {
            if (group.userData.initialPos) {
                group.position.copy(group.userData.initialPos);
            }
            group.rotation.set(0, 0, 0); // 회전 초기화
        });
        renderer.render(scene, camera);
    };

    // ---------------------------------------
    // adjacency 생성
    // ---------------------------------------
    function buildAdjacency(net) {
        const adj = [...Array(6)].map(() => []);

        function edgesOf(f) {
            // u,v 좌표 기준 edge 정보 (격자 기반)
            return [
                { a:[f.u, f.v], b:[f.u + f.w, f.v] },         // 0: top edge (가로 w)
                { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v+f.h]}, // 1: right edge (세로 h)
                { a:[f.u + f.w, f.v+f.h], b:[f.u, f.v+f.h]},   // 2: bottom edge (가로 w)
                { a:[f.u, f.v+f.h], b:[f.u, f.v] }             // 3: left edge (세로 h)
            ];
        }

        const EPS = 1e-6;

        for (let i = 0; i < net.faces.length; i++) {
            const fi = net.faces[i];
            const Ei = edgesOf(fi);

            for (let j = i + 1; j < net.faces.length; j++) {
                const fj = net.faces[j];
                const Ej = edgesOf(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        // 두 edge가 겹치고 방향이 반대인 경우 (같은 edge를 공유)
                        if (
                            Math.abs(Ei[ei].a[0] - Ej[ej].b[0]) < EPS && Math.abs(Ei[ei].a[1] - Ej[ej].b[1]) < EPS &&
                            Math.abs(Ei[ei].b[0] - Ej[ej].a[0]) < EPS && Math.abs(Ei[ei].b[1] - Ej[ej].a[1]) < EPS
                        ) {
                            adj[fi.id].push({ to: fj.id, edgeA: ei, edgeB: ej });
                            adj[fj.id].push({ to: fi.id, edgeA: ej, edgeB: ei });
                        }
                    }
                }
            }
        }

        return adj;
    }

    // ---------------------------------------
    // BFS folding tree
    // ---------------------------------------
    function buildTree(adj) {
        const parent = Array(6).fill(null);
        parent[0] = -1; // root

        const order = [];
        const Q = [0];

        while (Q.length) {
            const f = Q.shift();
            order.push(f);

            adj[f].forEach(n => {
                if (parent[n.to] === null) {
                    parent[n.to] = f;
                    Q.push(n.to);
                }
            });
        }

        return { parent, order };
    }

    // ---------------------------------------
    // edgeIndex에 따른 회전축 계산
    // ---------------------------------------
    function getEdgeWorldAxisAndPoint(parentGroup, childGroup, faceObj, parentFaceObj, relation) {
        
        // faceObj는 child, parentFaceObj는 parent
        
        // 1. 회전축의 위치(Point)를 Parent Face의 중앙 좌표계(Three.js world)에서 계산
        const { u, v, w, h } = parentFaceObj;
        let p1_u, p1_v, p2_u, p2_v;

        // parent의 edgeA (relation.edgeA)에 해당하는 2D 격자 좌표
        const parentEdges = getEdges(parentFaceObj);
        const edge = parentEdges[relation.edgeA];
        
        // 격자 좌표를 3D World 좌표로 변환 (u -> X, v -> -Y, Z=0)
        const p1 = new THREE.Vector3(edge.a[0], -edge.a[1], 0);
        const p2 = new THREE.Vector3(edge.b[0], -edge.b[1], 0);
        
        // 2. 축 (Axis) 계산: p1에서 p2로 향하는 벡터
        const axis = new THREE.Vector3().subVectors(p2, p1).normalize();
        
        // 3. 축의 시작점 (Point)
        const point = p1; 

        return { axis, point };
    }


    // ---------------------------------------
    // foldAnimate (직육면체 지원)
    // ---------------------------------------
    FoldEngine.foldAnimate = function (duration = 1) {
        const net = FoldEngine.currentNet;
        if (!net) return Promise.resolve(); 

        const adj = buildAdjacency(net);
        const { parent, order } = buildTree(adj);
        parentOf = parent;
        
        // 애니메이션 완료를 위한 Promise 생성
        return new Promise(resolve => {
            const start = performance.now();
            const animate = (time) => {
                const elapsed = (time - start) / 1000;
                const progress = Math.min(1, elapsed / duration);
                const angle = (Math.PI / 2) * progress; // 0 (unfold) -> Math.PI/2 (fold)
                
                // unfold 상태에서 시작 (애니메이션이 반복될 때 필요)
                FoldEngine.unfoldImmediate(); 
                
                // 모든 child에 대해 rotate
                order.forEach(faceId => {
                    const p = parent[faceId];
                    if (p === -1) return; // root 면은 회전하지 않음

                    const parentGroup = faceGroups[p];
                    const childGroup = faceGroups[faceId];

                    const relation = adj[p].find(x => x.to === faceId);
                    const faceObj = net.faces.find(f => f.id === faceId);
                    const parentFaceObj = net.faces.find(f => f.id === p);

                    const { axis, point } = getEdgeWorldAxisAndPoint(
                        parentGroup, childGroup, faceObj, parentFaceObj, relation
                    );
                    
                    // 회전 중심점과 축을 Three.js World 좌표계에서 사용
                    
                    // 1. Child Group을 회전축 시작점(Point)으로 이동 (좌표계 원점화)
                    childGroup.position.sub(point);

                    // 2. Child Group 회전
                    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
                    childGroup.applyMatrix(rotationMatrix);
                    
                    // 3. Child Group을 원래 위치로 되돌림 (좌표계 원점 복원)
                    childGroup.position.add(point);
                });

                renderer.render(scene, camera);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve(); // 애니메이션 완료
                }
            };
            
            // 모든 그룹의 matrixWorld를 업데이트하여 World 좌표 계산 정확성 보장
            scene.updateMatrixWorld(true);
            
            requestAnimationFrame(animate);
        });
    };

    // ---------------------------------------
    // getFaceGroups (validator가 사용)
    // ---------------------------------------
    FoldEngine.getFaceGroups = function () {
        return faceGroups;
    };

    // ---------------------------------------
    // Helper function for 2D edge info
    // ---------------------------------------
    function getEdges(f) {
        return [
            { a:[f.u, f.v],       b:[f.u + f.w, f.v]        }, // top
            { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v + f.h]  }, // right
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]  }, // bottom
            { a:[f.u, f.v + f.h], b:[f.u, f.v]              }  // left
        ];
    }
})();
