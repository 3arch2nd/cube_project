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

    // ----------------------------------------------------
    // (A) Face 기본 검증
    // ----------------------------------------------------
    function validateFaces(net) {
        if (!net || !Array.isArray(net.faces)) {
            return fail("전개도 데이터가 올바르지 않습니다.");
        }

        const validFaces = net.faces.filter(f => f && f.w > 0 && f.h > 0);

        if (validFaces.length !== 6) {
            return fail(`전개도는 반드시 6개의 면으로 구성되어야 합니다. 현재 유효 면 개수: ${validFaces.length}`);
        }

        const idSet = new Set();
        for (const f of validFaces) {
            if (typeof f.id !== 'number') return fail("면 id가 숫자가 아닙니다.");
            if (idSet.has(f.id)) return fail("중복된 face id가 있습니다: " + f.id);
            idSet.add(f.id);

            if (f.w <= 0 || f.h <= 0) {
                return fail("면의 가로/세로 크기가 잘못되었습니다.");
            }
        }

        return true;
    }

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

    // ----------------------------------------------------
    // (B) adjacency 검사
    // ----------------------------------------------------
    function buildAdjacency(net) {
        // net.faces가 6개 미만일 수 있으므로, 최대 id 기준으로 배열 생성
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const maxId = faces.reduce((max, f) => Math.max(max, f.id), -1);
        const adj = [...Array(maxId + 1)].map(() => []);
        
        if (faces.length !== 6) {
             // 이 오류는 이미 validateFaces에서 잡혔어야 하지만 안전을 위해 체크
             return fail(`adjacency 검사 실패: 면 개수 ${faces.length}`);
        }

        for (let i = 0; i < faces.length; i++) {
            const fi = faces[i];
            const Ei = getEdges(fi);

            for (let j = i+1; j < faces.length; j++) {
                const fj = faces[j];
                const Ej = getEdges(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (sameEdge(Ei[ei], Ej[ej])) {
                            // edge 길이 검사
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
        // adj 배열에 데이터가 있는 id만 유효한 face로 간주
        const facesIds = adj.map((a, id) => (Array.isArray(a) && a.length > 0) ? id : -1).filter(id => id !== -1);
        if (facesIds.length !== 6) return true; // 면 개수 오류는 다른 함수에서 처리

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
        
        // --- 가상 Three.js 환경 재구축 (FoldEngine의 init과 유사) ---
        const dummyCanvas = document.createElement("canvas");
        dummyCanvas.width = 300;
        dummyCanvas.height = 300;
        
        // FoldEngine을 재정의하지 않고 기존 FoldEngine의 기능을 최대한 활용합니다.
        const engine = window.FoldEngine;
        
        if (!engine.init || !engine.loadNet || !engine.getFaceGroups) {
            return fail("FoldEngine 모듈이 올바르지 않습니다.");
        }
        
        // 1. FoldEngine 초기화 및 로드 (scene/group/offset/initialPos 계산)
        // loadNet 내부에서 groups와 centerOffset3D가 계산됨
        engine.init(dummyCanvas); 
        engine.loadNet(net); 

        const groups = engine.getFaceGroups();
        if (groups.length !== 6) return fail("시뮬레이션 로드 실패: 면 개수 오류");
        
        // 2. Folding Tree 생성
        function buildTreeSim() {
            // adj는 validateNet에서 6개 면을 대상으로 만들어진 것으로 가정
            
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
                        // n.to가 유효한 face id인지 확인
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
        
        // FoldEngine 내부 변수를 가져올 수 없으므로, 로직을 직접 복제해야 합니다.
        // 여기서는 FoldEngine.js에서 사용하는 centerOffset3D 계산 로직을 복제합니다.
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
        function getAxisAndPointSim(parentGroup, relation) {
            const parentFace = faces.find(f => f.id === parentGroup.faceId);
            const parentEdges = getEdges(parentFace);
            const edge = parentEdges[relation.edgeA];
            
            const p1_world = new THREE.Vector3(edge.a[0], -edge.a[1], 0);
            const p2_world = new THREE.Vector3(edge.b[0], -edge.b[1], 0);
            
            const axis = new THREE.Vector3().subVectors(p2_world, p1_world).normalize();
            const point = p1_world; 

            return { axis, point };
        }

        try {
            // 3. 동기 Fold 시뮬레이션: 초기화 (unfold)
            groups.forEach(group => {
                // FoldEngine.loadNet에서 설정된 initialPos로 이동
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
                
                if (!parentGroup || !childGroup) return;

                const relation = adj[p].find(x => x.to === faceId);
                
                const { axis, point } = getAxisAndPointSim(parentGroup, relation);
                
                // point는 3D 월드 좌표계의 회전 기준점.
                const worldPoint = point.clone().sub(centerOffsetSim); 
                
                // ⭐ 오류 해결: FoldEngine.js의 회전 로직을 그대로 사용
                
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

        const groups = window.FoldEngine.getFaceGroups();
        if (groups.length > 0 && groups[0].parent) {
             // 씬 루트가 Three.Scene이므로, 이 단계에서는 matrixWorld를 업데이트할 필요가 없거나
             // FoldEngine.scene.updateMatrixWorld(true)가 필요합니다.
             // simulateFolding의 마지막에서 이미 호출되었으므로 생략 가능하나, 안전을 위해 체크.
             const scene = window.FoldEngine.scene;
             if (scene) scene.updateMatrixWorld(true);
        }

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
