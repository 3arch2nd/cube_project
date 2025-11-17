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
        // ... (생략: init 함수는 이전과 동일) ...
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(canvas.width, canvas.height);

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100);
        
        camera.position.set(0, 0, 8); 
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
        // ... (생략: createFaceGeometry 함수는 이전과 동일) ...
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
        // ... (생략: loadNet 함수는 이전과 동일) ...
        // 리셋
        faceGroups = [];
        while (scene.children.length) scene.remove(scene.children[0]);

        // 카메라/빛 재추가
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        
        const validFaces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;
        
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
            group.faceId = id; // ⭐ faceId를 group에 저장

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
        
        // ⭐ 오류 해결: load 직후 월드 행렬을 업데이트하여 foldAnimate 진입 시 안전하게 함
        scene.updateMatrixWorld(true);

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
        // ... (생략) ...
        return [
            { a:[f.u, f.v],       b:[f.u + f.w, f.v]        }, 
            { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v + f.h]  }, 
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]  }, 
            { a:[f.u, f.v + f.h], b:[f.u, f.v]              }  
        ];
    }

    // ---------------------------------------
    // [포함된 헬퍼 함수] adjacency 생성
    // ---------------------------------------
    function buildAdjacency(net) {
        const maxId = net.faces.filter(f => f).reduce((max, f) => Math.max(max, f.id), -1);
        const adj = [...Array(maxId + 1)].map(() => []);

        function edgesOf(f) {
            return [
                { a:[f.u, f.v], b:[f.u + f.w, f.v] },         
                { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v+f.h]}, 
                { a:[f.u + f.w, f.v+f.h], b:[f.u, f.v+f.h]},   
                { a:[f.u, f.v+f.h], b:[f.u, f.v] }             
            ];
        }
        
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
        const groups = FoldEngine.getFaceGroups();
        const maxId = groups.reduce((max, g) => Math.max(max, g.faceId), -1);
        if (maxId < 0) return { parent: [], order: [] };

        const parent = Array(maxId + 1).fill(null);
        const rootId = groups[0].faceId; 
        parent[rootId] = -1; 

        const order = [];
        const Q = [rootId];

        while (Q.length) {
            const f = Q.shift();
            order.push(f);

            if (adj[f]) {
                 adj[f].forEach(n => {
                    if (parent[n.to] === null && n.to <= maxId) { 
                        parent[n.to] = f;
                        Q.push(n.to);
                    }
                });
            }
        }
        return { parent, order };
    }
    
    // ---------------------------------------
    // [포함된 헬퍼 함수] edgeIndex에 따른 회전축 계산 및 로컬 변환
    // ---------------------------------------
    function getAxisAndPoint(parentGroup, relation) {
        
        const parentInfo = parentGroup.userData.netInfo;

        const parentEdges = getEdges(parentInfo);
        const edge = parentEdges[relation.edgeA];
        
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
        
        if (order.length <= 1) return Promise.resolve();

        return new Promise(resolve => {
            const start = performance.now();
            const animate = (time) => {
                const elapsed = (time - start) / 1000;
                const progress = Math.min(1, elapsed / duration);
                const angle = (Math.PI / 2) * progress; 
                
                FoldEngine.unfoldImmediate(); 
                
                // ⭐ 오류 해결: 애니메이션 루프 내에서 World Matrix 업데이트
                scene.updateMatrixWorld(true);

                order.forEach(faceId => {
                    const p = parent[faceId];
                    if (p === -1) return; 

                    const parentGroup = faceGroups.find(g => g.faceId === p);
                    const childGroup = faceGroups.find(g => g.faceId === faceId);
                    
                    if (!parentGroup || !childGroup) return; 

                    const relation = adj[p].find(x => x.to === faceId);
                    
                    const { axis, point } = getAxisAndPoint(parentGroup, relation);

                    const worldPoint = point.clone().sub(centerOffset3D); 
                    
                    // ⭐ 오류 해결: childGroup.matrixWorld가 유효한지 확인 후 getInverse 호출
                    // loadNet에서 scene.updateMatrixWorld(true)를 호출했고, 
                    // 애니메이션 루프에서도 호출했으므로 matrixWorld는 유효해야 함.
                    // 만약 이 단계에서도 오류가 난다면, group이 scene에 연결된 후 충분한 시간이 없었거나 
                    // 계층 구조에 문제가 있는 것.
                    
                    childGroup.updateMatrixWorld(true); // 혹시 모를 누락 방지

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
