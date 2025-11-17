/**
 * validator.js – 정육면체 + 직육면체 전개도 검증 확장
 * * 제공 기능:
 * validateNet(net)
 * → true / false
 * → 오류 메시지는 validateNet.lastError 로 확인
 */

(function () {
    'use strict';

    const Validator = {};
    window.Validator = Validator;

    Validator.lastError = "";
    const EPS = 1e-6;

    // ----------------------------------------------------
    // 간편 오류 처리
    // ----------------------------------------------------
    function fail(msg) {
        Validator.lastError = msg;
        return false;
    }

    // (A), (B) 생략... (변경 없음)
    // ----------------------------------------------------
    // 면의 4개 edge의 좌표 (정사각형이 아닌 w,h 반영)
    // ----------------------------------------------------
    function getEdges(f) {
        const { u, v, w, h } = f;

        return [
            { a:[u, v],       b:[u+w, v]       },   // top
            { a:[u+w, v],     b:[u+w, v+h]     },   // right
            { a:[u+w, v+h],   b:[u, v+h]       },   // bottom
            { a:[u, v+h],     b:[u, v]         }    // left
        ];
    }

    // edge 길이 (투명성: 전개도 좌표에서는 w/h 그대로길이)
    function edgeLength(edge) {
        const [x1, y1] = edge.a;
        const [x2, y2] = edge.b;
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx*dx + dy*dy);
    }

    function sameEdge(e1, e2) {
        return (
            Math.abs(e1.a[0] - e2.b[0]) < EPS &&
            Math.abs(e1.a[1] - e2.b[1]) < EPS &&
            Math.abs(e1.b[0] - e2.a[0]) < EPS &&
            Math.abs(e1.b[1] - e2.a[1]) < EPS
        );
    }

    function buildAdjacency(net) {
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const maxId = faces.reduce((max, f) => Math.max(max, f.id), -1);
        const adj = [...Array(maxId + 1)].map(() => []);
        
        if (faces.length !== 6) {
             return fail(`adjacency 검사 실패: 면 개수 ${faces.length}`);
        }
        
        // ... (Adjacency 계산 로직 생략, 변경 없음) ...
        for (let i = 0; i < faces.length; i++) {
            const fi = faces[i];
            const Ei = getEdges(fi);

            for (let j = i+1; j < faces.length; j++) {
                const fj = faces[j];
                const Ej = getEdges(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (sameEdge(Ei[ei], Ej[ej])) {
                            if (Math.abs(edgeLength(Ei[ei]) - edgeLength(Ej[ej])) > EPS) {
                                return fail("두 면의 접촉 edge 길이가 일치하지 않습니다.");
                            }
                            adj[fi.id].push({ to: fj.id, edgeA: ei, edgeB: ej });
                            adj[fj.id].push({ to: fi.id, edgeA: ej, edgeB: ei });
                        }
                    }
                }
            }
        }

        let totalConnections = 0;
        adj.forEach(a => totalConnections += a.length);
        totalConnections = totalConnections / 2;

        if (totalConnections !== 5) {
            return fail(`전개도 면들이 정확히 5개 연결(edge sharing)되어야 합니다. 현재: ${totalConnections}`);
        }

        return adj;
    }

    function checkConnectivity(adj) {
        const facesIds = adj.map((a, id) => (Array.isArray(a) && a.length > 0) ? id : -1).filter(id => id !== -1);
        if (facesIds.length !== 6) return true;

        const visited = Array(adj.length).fill(false);
        const Q = [facesIds[0]];
        visited[facesIds[0]] = true;

        while (Q.length) {
            const f = Q.shift();
            adj[f].forEach(n => {
                if (n.to < visited.length && !visited[n.to]) {
                    visited[n.to] = true;
                    Q.push(n.to);
                }
            });
        }

        if (facesIds.some(id => !visited[id])) {
            return fail("전개도 면들이 하나로 연결되지 않았습니다.");
        }

        return true;
    }


    // ----------------------------------------------------
    // (C) FoldEngine 기반 실제 fold 테스트
    // ----------------------------------------------------
    function simulateFolding(net, adj) {
        
        const dummyCanvas = document.createElement("canvas");
        dummyCanvas.width = 300;
        dummyCanvas.height = 300;
        
        const engine = window.FoldEngine;
        
        if (!engine.init || !engine.loadNet || !engine.getFaceGroups) {
            return fail("FoldEngine 모듈이 올바르지 않습니다.");
        }
        
        // 1. FoldEngine 초기화 및 로드 
        engine.init(dummyCanvas); 
        engine.loadNet(net); 

        const groups = engine.getFaceGroups();
        if (groups.length !== 6) return fail("시뮬레이션 로드 실패: 면 개수 오류");
        
        // 2. Folding Tree 생성
        function buildTreeSim() {
            // ... (Tree 생성 로직 생략, 변경 없음) ...
            const parent = Array(adj.length).fill(null);
            const rootId = groups[0].faceId; 
            parent[rootId] = -1;

            const order = [];
            const Q = [rootId];

            while (Q.length) {
                const f = Q.shift();
                order.push(f);
                
                if (adj[f]) {
                     adj[f].forEach(n => {
                        if (parent[n.to] === null && groups.some(g => g.faceId === n.to)) { 
                            parent[n.to] = f;
                            Q.push(n.to);
                        }
                    });
                }
            }
            return { parent, order };
        }
        
        const { parent, order } = buildTreeSim();
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        
        // FoldEngine.js에서 사용하는 centerOffset3D 계산 로직을 복제합니다.
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;
        for (const f of faces) {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        }
        const netCenterU = (minU + maxU) / 2;
        const netCenterV = (minV + maxV) / 2;
        const centerOffsetSim = new THREE.Vector3(netCenterU, -netCenterV, 0);

        // [포함된 헬퍼 함수] edgeIndex에 따른 회전축 계산 및 로컬 변환 (FoldEngine 복제)
        function getAxisAndPointSim(parentFace) { // parentGroup 대신 parentFace 객체만 받도록 변경
            const parentEdges = getEdges(parentFace);
            const edge = parentEdges[parentFace.relation.edgeA]; // relation 정보는 adj에서 가져옴
            
            const p1_world = new THREE.Vector3(edge.a[0], -edge.a[1], 0);
            const p2_world = new THREE.Vector3(edge.b[0], -edge.b[1], 0);
            
            const axis = new THREE.Vector3().subVectors(p2_world, p1_world).normalize();
            const point = p1_world; 

            return { axis, point };
        }

        try {
            // 3. 동기 Fold 시뮬레이션: 초기화 (unfold)
            groups.forEach(group => {
                group.position.copy(group.userData.initialPos);
                group.rotation.set(0, 0, 0); 
                group.updateMatrix(); 
            });

            engine.scene.updateMatrixWorld(true);
            
            const angle = Math.PI / 2; // 완전히 접힘

            order.forEach(faceId => {
                const p = parent[faceId];
                if (p === -1) return;

                const parentGroup = groups.find(g => g.faceId === p);
                const childGroup = groups.find(g => g.faceId === faceId);
                
                // ⭐ 핵심 안정성 체크: 여기서 `undefined` 오류 발생 방지
                if (!parentGroup || !childGroup) {
                    throw new Error(`Parent or child group not found for folding faces ${p} -> ${faceId}`);
                }

                const relation = adj[p].find(x => x.to === faceId);
                const parentFaceObj = faces.find(f => f.id === p);
                
                // 임시로 relation 정보를 Face 객체에 추가
                parentFaceObj.relation = relation;
                
                const { axis, point } = getAxisAndPointSim(parentFaceObj);
                
                const worldPoint = point.clone().sub(centerOffsetSim); 
                
                
                parentGroup.updateMatrixWorld(true); 
                childGroup.updateMatrixWorld(true); 

                const invMatrix = new THREE.Matrix4().getInverse(childGroup.matrixWorld);
                const localPoint = worldPoint.clone().applyMatrix4(invMatrix);

                childGroup.position.sub(localPoint);
                
                const localAxis = axis.clone().transformDirection(childGroup.matrixWorld.getInverse());
                
                childGroup.rotateOnAxis(localAxis, angle);
                
                childGroup.position.add(localPoint);
                childGroup.updateMatrix(); 
            });
            
            engine.scene.updateMatrixWorld(true);

        } catch (err) {
            // ⭐ 오류 메시지 출력 후 fail()
            console.warn("Validator Simulate Fold Error:", err);
            return fail("접기 시뮬레이션 중 오류가 발생했습니다: " + err.message);
        }

        // 성공적으로 fold되었는지 판단
        for (let g of groups) {
            const p = g.position;
            if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) {
                return fail("면의 folding 위치가 비정상적(NaN/Infinity)입니다.");
            }
        }

        return true;
    }

    // ----------------------------------------------------
    // (D) overlap 검사
    // ----------------------------------------------------
    function checkOverlap() {
        if (!window.Overlap || !window.Overlap.noOverlapCheck) {
            console.warn("Overlap 모듈 없음 → 겹침 검사 생략");
            return true;
        }

        const scene = window.FoldEngine.scene;
        if (scene) scene.updateMatrixWorld(true);

        const ok = window.Overlap.noOverlapCheck();
        if (!ok) {
            return fail("접었을 때 면이 서로 겹칩니다.");
        }
        return true;
    }

    // ----------------------------------------------------
    // 최종 공개 함수: validateNet
    // ----------------------------------------------------
    Validator.validateNet = function (net) {
        Validator.lastError = "";

        if (!validateFaces(net)) return false;

        const adj = buildAdjacency(net);
        if (!adj) return false;

        if (!checkConnectivity(adj)) return false;

        if (!simulateFolding(net, adj)) return false;

        if (!checkOverlap()) return false;

        return true;
    };

})();
