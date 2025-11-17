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
    FoldEngine.currentNet = null; // main.js에서 net을 저장하기 위해 추가

    const WHITE = 0xffffff;
    const OUTLINE = 0x333333;
    const EPS = 1e-6;
    
    // 3D 뷰 중앙 정렬을 위한 상태 변수
    let centerOffset3D = new THREE.Vector3(0, 0, 0);


    // ---------------------------------------
    //  Three.js 초기화
    // ---------------------------------------
    FoldEngine.init = function (canvas) {
        // 이미 renderer가 있다면 기존 캔버스를 재사용할 수 있도록 체크 (옵션)
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        }
        renderer.setSize(canvas.width, canvas.height);

        // 이전 scene에 있던 객체들 제거 및 scene 초기화
        if (scene) {
            while (scene.children.length > 0) {
                scene.remove(scene.children[0]);
            }
        } else {
            scene = new THREE.Scene();
        }


        if (!camera || camera.aspect !== canvas.width / canvas.height) {
            camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100);
        }
        
        camera.position.set(0, 0, 8); 
        camera.lookAt(new THREE.Vector3(0, 0, 0));

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(4, 5, 6);
        scene.add(light);

        const amb = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(amb);
        scene.add(camera); 
    };

    // ---------------------------------------
    // face geometry 생성 (w × h)
    // ---------------------------------------
    function createFaceGeometry(w, h) {
        // 기존 Three.js 버전에서는 Geometry가 Deprecated. BufferGeometry 사용 권장
        // 그러나 기존 코드 호환성을 위해 Geometry 유지
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
        FoldEngine.currentNet = net; // net을 저장

        // 리셋
        faceGroups = [];
        // scene에 남아있는 이전 mesh/group 제거
        const objectsToRemove = scene.children.filter(obj => obj.type === 'Group');
        objectsToRemove.forEach(obj => scene.remove(obj));
        
        // 카메라/빛은 init에서 이미 처리되었으므로 추가 로직은 생략 가능하나,
        // 안전을 위해 Group만 제거하는 것이 좋다. (위 코드 반영)

        
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
        
        // 3D 좌표계: U축(X), V축(Y)은 반대 (상하 반전)
        // centerOffset3D는 전개도상의 중앙점 좌표를 3D 월드 좌표계 기준으로 변환한 것.
        // 이 값을 빼면 각 면의 중심이 3D 월드의 (0,0,0) 주변으로 이동한다.
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
            
            group.matrixAutoUpdate = false; 

            const faceCenterX = u + w/2;
            const faceCenterY = v + h/2;
            
            // 초기 위치: 2D 전개도 좌표를 3D 월드 좌표로 변환
            const initialPos = new THREE.Vector3(
                faceCenterX - netCenterU, 
                -(faceCenterY - netCenterV), // Y축 반전
                0
            );

            group.position.copy(initialPos);
            group.updateMatrix(); 
            group.userData.initialPos = initialPos.clone(); // deep copy
            group.userData.netInfo = { w, h, u, v }; 

            scene.add(group);
            faceGroups.push(group);
        });

        faceGroups.sort((a, b) => a.faceId - b.faceId);
        
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
            group.updateMatrix(); 
        });
        scene.updateMatrixWorld(true); 
        renderer.render(scene, camera);
    };

    // ---------------------------------------
    // [포함된 헬퍼 함수] getEdges
    // ---------------------------------------
    function getEdges(f) {
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
        const validFaces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const maxId = validFaces.reduce((max, f) => Math.max(max, f.id), -1);
        
        // face id가 0부터 maxId까지 모두 존재한다는 가정 하에 배열 생성
        const adj = [...Array(maxId + 1)].map(() => []);

        function edgesOf(f) {
            return [
                { a:[f.u, f.v], b:[f.u + f.w, f.v] },         
                { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v+f.h]}, 
                { a:[f.u + f.w, f.v+f.h], b:[f.u, f.v+f.h]},   
                { a:[f.u, f.v+f.h], b:[f.u, f.v] }             
            ];
        }
        
        const faces = validFaces; 

        for (let i = 0; i < faces.length; i++) {
            const fi = faces[i];
            const Ei = edgesOf(fi);

            for (let j = i + 1; j < faces.length; j++) {
                const fj = faces[j];
                const Ej = edgesOf(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        // sameEdge 로직: E[ei].a == E[ej].b && E[ei].b == E[ej].a
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
        const validIds = groups.map(g => g.faceId);
        const maxId = validIds.length > 0 ? Math.max(...validIds) : -1;
        
        if (maxId < 0 || validIds.length === 0) return { parent: [], order: [] };

        const parent = Array(maxId + 1).fill(null);
        // 그룹이 하나 이상 있을 때, 첫 번째 그룹을 루트로 설정
        const rootId = groups[0].faceId; 
        parent[rootId] = -1; 

        const order = [];
        const Q = [rootId];

        while (Q.length) {
            const f = Q.shift();
            order.push(f);

            if (adj[f]) {
                 adj[f].forEach(n => {
                    // n.to가 유효한 id인지, 이미 처리되지 않았는지 확인
                    if (parent[n.to] === null && validIds.includes(n.to)) { 
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
        
        // 2D 전개도 좌표를 3D World (XY 평면) 좌표로 변환. Y축은 반전.
        const p1_world = new THREE.Vector3(edge.a[0], -edge.a[1], 0);
        const p2_world = new THREE.Vector3(edge.b[0], -edge.b[1], 0);
        
        // 축: p1에서 p2로 향하는 벡터
        const axis = new THREE.Vector3().subVectors(p2_world, p1_world).normalize();
        const point = p1_world; // 회전의 기준점

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

        // 렌더링 함수가 없으면 시뮬레이션 불가
        if (!renderer) return Promise.resolve();

        return new Promise(resolve => {
            const start = performance.now();
            let animationFrameId = null;

            const animate = (time) => {
                const elapsed = (time - start) / 1000;
                const progress = Math.min(1, elapsed / duration);
                const angle = (Math.PI / 2) * progress; 
                
                // 1. 펼친 상태로 초기화
                FoldEngine.unfoldImmediate(); 
                
                // scene.updateMatrixWorld(true); // unfoldImmediate에서 호출됨.

                order.forEach(faceId => {
                    const p = parent[faceId];
                    if (p === -1) return; 

                    const parentGroup = faceGroups.find(g => g.faceId === p);
                    const childGroup = faceGroups.find(g => g.faceId === faceId);
                    
                    if (!parentGroup || !childGroup) return; 

                    const relation = adj[p].find(x => x.to === faceId);
                    
                    const { axis, point } = getAxisAndPoint(parentGroup, relation);

                    // point는 3D 월드 좌표계의 회전 기준점. 
                    // 이 기준점을 전체 전개도 중앙 정렬 오프셋만큼 보정한다.
                    const worldPoint = point.clone().sub(centerOffset3D); 
                    
                    
                    // ⭐ 회전 순서가 매우 중요: 부모가 접혀야 자식도 그에 맞춰 접힌다.
                    // Three.js의 계층 구조를 사용하지 않고 개별적으로 회전을 적용하므로,
                    // 매 프레임마다 이전까지의 누적된 회전/변환을 반영해야 한다.
                    
                    // 1. 자식 그룹의 현재 월드 행렬을 역변환하여 기준점의 로컬 좌표를 찾는다.
                    childGroup.updateMatrixWorld(true); 
                    const invMatrix = new THREE.Matrix4().getInverse(childGroup.matrixWorld);
                    const localPoint = worldPoint.clone().applyMatrix4(invMatrix);

                    // 2. 로컬 좌표를 원점으로 이동 (회전의 중심을 로컬 원점으로)
                    childGroup.position.sub(localPoint);
                    childGroup.updateMatrixWorld(true);

                    // 3. 월드 축을 자식 그룹의 로컬 좌표계로 변환 (회전축)
                    const localAxis = axis.clone().transformDirection(childGroup.matrixWorld.getInverse());
                    
                    // 4. 회전 적용
                    childGroup.rotateOnAxis(localAxis, angle);
                    
                    // 5. 다시 원래 위치로 이동
                    childGroup.position.add(localPoint);
                    childGroup.updateMatrix(); 
                });

                // scene의 모든 객체의 월드 행렬 업데이트
                scene.updateMatrixWorld(true);

                renderer.render(scene, camera);

                if (progress < 1) {
                    animationFrameId = requestAnimationFrame(animate);
                } else {
                    cancelAnimationFrame(animationFrameId);
                    resolve(); 
                }
            };
            
            animationFrameId = requestAnimationFrame(animate);
        });
    };

    // ---------------------------------------
    // getFaceGroups (validator가 사용)
    // ---------------------------------------
    FoldEngine.getFaceGroups = function () {
        return faceGroups;
    };

})();
