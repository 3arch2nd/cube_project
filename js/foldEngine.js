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
    const EPS = 1e-6;
    
    // 3D 뷰 중앙 정렬을 위한 상태 변수
    let centerOffset3D = new THREE.Vector3(0, 0, 0);


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
        
        // 전개도의 2D 중심 좌표 계산 (3D 시점 중앙 정렬용)
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;
        
        // ⭐ 유효한 면만 계산에 포함
        const validFaces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        
        for (const f of validFaces) {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        }
        
        const netCenterU = (minU + maxU) / 2;
        const netCenterV = (minV + maxV) / 2;
        
        centerOffset3D.set(netCenterU, -netCenterV, 0);


        // faceGroup 생성
        validFaces.forEach(face => {
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

            const faceCenterX = u + w/2;
            const faceCenterY = v + h/2;
            
            const initialPos = new THREE.Vector3(
                faceCenterX - netCenterU, 
                -(faceCenterY - netCenterV), 
                0
            );

            group.position.copy(initialPos);
            group.userData.initialPos = initialPos;
            group.userData.netInfo = { w, h, u, v }; 

            scene.add(group);
            faceGroups.push(group);
        });

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
            group.setRotationFromEuler(new THREE.Euler(0, 0, 0)); 
        });
        renderer.render(scene, camera);
    };

    // ---------------------------------------
    // [포함된 헬퍼 함수] getEdges
    // ---------------------------------------
    function getEdges(f) {
        return [
            { a:[f.u, f.v],       b:[f.u + f.w, f.v]        }, // 0: top
            { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v + f.h]  }, // 1: right
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]  }, // 2: bottom
            { a:[f.u, f.v + f.h], b:[f.u, f.v]              }  // 3: left
        ];
    }

    // ---------------------------------------
    // [포함된 헬퍼 함수] adjacency 생성
    // ---------------------------------------
    function buildAdjacency(net) {
        const adj = [...Array(6)].map(() => []);

        function edgesOf(f) {
            return [
                { a:[f.u, f.v], b:[f.u + f.w, f.v] },         
                { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v+f.h]}, 
                { a:[f.u + f.w, f.v+f.h], b:[f.u, f.v+f.h]},   
                { a:[f.u, f.v+f.h], b:[f.u, f.v] }             
            ];
        }
        
        // ⭐ 면의 ID는 0부터 5까지라고 가정하지만, net.faces 배열에는 유효한 면만 들어옴.
        const faces = net.faces.filter(f => f); 

        for (let i = 0; i < faces.length; i++) {
            const fi = faces[i];
            const Ei = edgesOf(fi);

            for (let j = i + 1; j < faces.length; j++) {
                const fj = faces[j];
                const Ej = edgesOf(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
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
    // [포함된 헬퍼 함수] BFS folding tree
    // ---------------------------------------
    function buildTree(adj) {
        // 면의 최대 ID를 기준으로 parent 배열 크기를 결정 (최대 6개면)
        const maxId = faceGroups.reduce((max, g) => Math.max(max, g.faceId), -1);
        if (maxId < 0) return { parent: [], order: [] };

        const parent = Array(maxId + 1).fill(null);
        const rootId = faceGroups[0].faceId; // 항상 첫 번째 그룹을 root로 가정
        parent[rootId] = -1; 

        const order = [];
        const Q = [rootId];

        while (Q.length) {
            const f = Q.shift();
            order.push(f);

            // adj[f]가 정의되어 있는지 확인
            if (adj[f]) {
                 adj[f].forEach(n => {
                    if (parent[n.to] === null) {
                        parent[n.to] = f;
                        Q.push(n.to);
                    }
                });
            }
        }
        return { parent, order };
    }
    
    // ---------------------------------------
    // [포함된 헬퍼 함수] edgeIndex에 따른 회전축 계산 및 로컬 변환 (Helper for foldAnimate)
    // ---------------------------------------
    function getAxisAndPoint(parentGroup, relation) {
        
        const parentInfo = parentGroup.userData.netInfo;

        const parentEdges = getEdges(parentInfo);
        const edge = parentEdges[relation.edgeA];
        
        // ⭐ 2. 오류 수정: 면의 크기가 0일 경우 TypeError 방지 (이 단계에서는 이미 loadNet에서 필터링되었어야 함)
        if (!edge) return { axis: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(0, 0, 0) };

        // 격자 좌표를 3D World 좌표로 변환 (u -> X, v -> -Y, Z=0)
        const p1_world = new THREE.Vector3(edge.a[0], -edge.a[1], 0);
        const p2_world = new THREE.Vector3(edge.b[0], -edge.b[1], 0);
        
        const axis = new THREE.Vector3().subVectors(p2_world, p1_world).normalize();
        const point = p1_world; 

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
        
        // ⭐ 2. 오류 수정: 접을 면이 1개 이하일 경우 (root만 존재) 접기 시도 중단
        if (order.length <= 1) return Promise.resolve();

        return new Promise(resolve => {
            const start = performance.now();
            const animate = (time) => {
                const elapsed = (time - start) / 1000;
                const progress = Math.min(1, elapsed / duration);
                const angle = (Math.PI / 2) * progress; 
                
                FoldEngine.unfoldImmediate(); 
                
                scene.updateMatrixWorld(true);

                order.forEach(faceId => {
                    const p = parent[faceId];
                    if (p === -1) return; 

                    const parentGroup = faceGroups.find(g => g.faceId === p);
                    const childGroup = faceGroups.find(g => g.faceId === faceId);
                    
                    if (!parentGroup || !childGroup) return; // 면이 로드되지 않았으면 건너뜀

                    const relation = adj[p].find(x => x.to === faceId);
                    
                    const { axis, point } = getAxisAndPoint(parentGroup, relation);

                    const worldPoint = point.clone().sub(centerOffset3D); 
                    
                    const invMatrix = new THREE.Matrix4().getInverse(childGroup.matrixWorld);
                    const localPoint = worldPoint.clone().applyMatrix4(invMatrix);

                    childGroup.position.sub(localPoint);
                    
                    const localAxis = axis.clone().transformDirection(childGroup.matrixWorld.getInverse());
                    
                    childGroup.rotateOnAxis(localAxis, angle);
                    
                    childGroup.position.add(localPoint);
                });

                renderer.render(scene, camera);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve(); 
                }
            };
            
            requestAnimationFrame(animate);
        });
    };

    // ---------------------------------------
    // getFaceGroups (validator가 사용)
    // ---------------------------------------
    FoldEngine.getFaceGroups = function () {
        return faceGroups;
    };

})();
