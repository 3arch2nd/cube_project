/**
 * foldEngine.js – Cube 전개도 접기 엔진
 *
 * (지금은 정육면체/직육면체 모두 되지만, 정육면체만 써도 무방)
 */

(function () {
    'use strict';

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    let scene, camera, renderer;
    let faceGroups = [];   // 각 face의 THREE.Group
    let parentOf = [];     // folding tree
    FoldEngine.currentNet = null; 

    const WHITE = 0xffffff;
    const OUTLINE = 0x333333;
    const EPS = 1e-6;
    
    // (지금은 안 써도 무방하지만 남겨둠)
    let centerOffset3D = new THREE.Vector3(0, 0, 0);


    // ---------------------------------------
    //  Three.js 초기화
    // ---------------------------------------
    FoldEngine.init = function (canvas) {
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        }
        renderer.setSize(canvas.width, canvas.height);

        if (scene) {
            while (scene.children.length > 0) {
                scene.remove(scene.children[0]);
            }
        } else {
            scene = new THREE.Scene();
            FoldEngine.scene = scene; 
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
    // 2D 전개도 → 3D face group 생성 (Promise 반환)
    // ---------------------------------------
    FoldEngine.loadNet = function (net) {
        FoldEngine.currentNet = net; 

        // 리셋
        faceGroups = [];
        const objectsToRemove = scene.children.filter(obj => obj.type === 'Group');
        objectsToRemove.forEach(obj => scene.remove(obj));
        
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
            group.faceId = id; 

            const geom = createFaceGeometry(w, h);
            const mat = new THREE.MeshLambertMaterial({
                color: WHITE,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geom, mat);

            // outline
            const edges = new THREE.EdgesGeometry(geom);
            const line = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({ color: OUTLINE })
            );

            group.add(mesh);
            group.add(line);
            
            group.matrixAutoUpdate = false; 

            const faceCenterX = u + w / 2;
            const faceCenterY = v + h / 2;
            
            const initialPos = new THREE.Vector3(
                faceCenterX - netCenterU, 
                -(faceCenterY - netCenterV), 
                0
            );

            group.position.copy(initialPos);
            group.updateMatrix(); 
            group.userData.initialPos = initialPos.clone(); 
            group.userData.netInfo = { w, h, u, v }; 

            scene.add(group);
            faceGroups.push(group);
        });

        faceGroups.sort((a, b) => a.faceId - b.faceId);
        
        return new Promise(resolve => {
            scene.updateMatrixWorld(true); 
            renderer.render(scene, camera); 
            requestAnimationFrame(() => {
                resolve();
            });
        });
    };

    // ---------------------------------------
    // unfoldImmediate: 2D 평면 상태로 리셋
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
    // 전개도 edge 도우미 (adjacency 용)
    // ---------------------------------------
    function getEdges(f) {
        return [
            { a:[f.u, f.v],          b:[f.u + f.w, f.v]        },  // top
            { a:[f.u + f.w, f.v],    b:[f.u + f.w, f.v + f.h]  },  // right
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]     },  // bottom
            { a:[f.u, f.v + f.h],    b:[f.u, f.v]              }   // left
        ];
    }

    // ---------------------------------------
    // adjacency 생성 (face id 기준)
    // ---------------------------------------
    function buildAdjacency(net) {
        const validFaces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const maxId = validFaces.reduce((max, f) => Math.max(max, f.id), -1);
        
        const adj = [...Array(maxId + 1)].map(() => []);

        function edgesOf(f) {
            return [
                { a:[f.u, f.v],          b:[f.u + f.w, f.v]       }, 
                { a:[f.u + f.w, f.v],    b:[f.u + f.w, f.v+f.h]   }, 
                { a:[f.u + f.w, f.v+f.h], b:[f.u, f.v+f.h]        }, 
                { a:[f.u, f.v+f.h],      b:[f.u, f.v]             } 
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
                        if (
                            Math.abs(Ei[ei].a[0] - Ej[ej].b[0]) < EPS &&
                            Math.abs(Ei[ei].a[1] - Ej[ej].b[1]) < EPS &&
                            Math.abs(Ei[ei].b[0] - Ej[ej].a[0]) < EPS &&
                            Math.abs(Ei[ei].b[1] - Ej[ej].a[1]) < EPS
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
        const groups = FoldEngine.getFaceGroups();
        const validIds = groups.map(g => g.faceId);
        const maxId = validIds.length > 0 ? Math.max(...validIds) : -1;
        
        if (maxId < 0 || validIds.length === 0) return { parent: [], order: [] };

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
    // edgeIndex에 따른 실제 3D 회전축 계산
    //  → 부모 face의 로컬 네 꼭짓점을 기준으로 축 계산
    // ---------------------------------------
    function getAxisAndPoint(parentGroup, relation) {
        const parentInfo = parentGroup.userData.netInfo;
        const w = parentInfo.w;
        const h = parentInfo.h;

        const hw = w / 2;
        const hh = h / 2;

        // 로컬 좌표상의 네 꼭짓점 (시계/반시계 상관 없이 top→right→bottom→left 순서)
        const cornersLocal = [
            new THREE.Vector3(-hw,  hh, 0), // 0: top-left
            new THREE.Vector3( hw,  hh, 0), // 1: top-right
            new THREE.Vector3( hw, -hh, 0), // 2: bottom-right
            new THREE.Vector3(-hw, -hh, 0)  // 3: bottom-left
        ];

        const e = relation.edgeA; // 0: top, 1: right, 2: bottom, 3: left

        const i1 = e;
        const i2 = (e + 1) % 4;

        // 로컬 → 월드 변환
        const p1_world = cornersLocal[i1].clone().applyMatrix4(parentGroup.matrixWorld);
        const p2_world = cornersLocal[i2].clone().applyMatrix4(parentGroup.matrixWorld);

        const axis = new THREE.Vector3().subVectors(p2_world, p1_world).normalize();

        // point는 edge의 한 끝점(월드 좌표)
        return { axis, point: p1_world };
    }


    // ---------------------------------------
    // foldAnimate
    // ---------------------------------------
    FoldEngine.foldAnimate = function (duration = 1) {
        const net = FoldEngine.currentNet;
        if (!net) return Promise.resolve(); 

        const adj = buildAdjacency(net);
        const { parent, order } = buildTree(adj);
        parentOf = parent;
        
        if (order.length <= 1) return Promise.resolve();
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
                
                order.forEach(faceId => {
                    const p = parent[faceId];
                    if (p === -1) return; 

                    const parentGroup = faceGroups.find(g => g.faceId === p);
                    const childGroup  = faceGroups.find(g => g.faceId === faceId);
                    
                    if (!parentGroup || !childGroup) {
                        console.warn("[FoldAnimate WARN] Missing parent/child group", { faceId, p });
                        return; 
                    }

                    const relation = adj[p] && adj[p].find(x => x.to === faceId);
                    if (!relation) {
                        console.warn("[FoldAnimate WARN] Missing relation", { p, faceId, row: adj[p] });
                        return; 
                    }

                    // 부모 face의 실제 3D edge를 기준으로 회전축/피벗 계산
                    parentGroup.updateMatrixWorld(true);
                    childGroup.updateMatrixWorld(true);

                    const { axis, point } = getAxisAndPoint(parentGroup, relation);
                    const worldPoint = point.clone();  // 이미 월드 좌표이므로 centerOffset 보정 불필요
                    
                    // 행렬 업데이트
                    childGroup.updateMatrix(); 

                    // matrixWorld 검사
                    if (!childGroup.matrixWorld || !childGroup.matrixWorld.elements) {
                        console.warn(`[FoldAnimate WARN] Invalid matrixWorld for face ${faceId}`, childGroup);
                        return;
                    }

                    // inverse 계산 (구버전 three.js 방식)
                    const invMatrix = new THREE.Matrix4();
                    invMatrix.getInverse(childGroup.matrixWorld);

                    const localPoint = worldPoint.clone().applyMatrix4(invMatrix);

                    childGroup.position.sub(localPoint);
                    
                    // 축을 로컬 좌표로 변환
                    const localAxis = axis.clone().applyMatrix4(invMatrix).normalize();
                    
                    childGroup.rotateOnAxis(localAxis, angle);
                    
                    childGroup.position.add(localPoint);
                    childGroup.updateMatrix(); 
                });

                scene.updateMatrixWorld(true);
                renderer.render(scene, camera);

                if (progress < 1) {
                    animationFrameId = requestAnimationFrame(animate);
                } else {
                    cancelAnimationFrame(animationFrameId);
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
