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
        // ... (생략: validateFaces 함수는 이전과 동일) ...
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
        // ... (생략: getEdges 함수는 이전과 동일) ...
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
        // ... (생략: buildAdjacency 함수는 이전과 동일) ...
        const adj = [...Array(6)].map(() => []);
        
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);

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
        // ... (생략: checkConnectivity 함수는 이전과 동일) ...
        const facesIds = adj.map((a, id) => a.length > 0 ? id : -1).filter(id => id !== -1);
        if (facesIds.length === 0) return true; 

        const visited = Array(6).fill(false);
        const Q = [facesIds[0]];
        visited[facesIds[0]] = true;

        while (Q.length) {
            const f = Q.shift();
            adj[f].forEach(n => {
                if (!visited[n.to]) {
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

        const engine = {};
        Object.keys(window.FoldEngine).forEach(key => {
             engine[key] = window.FoldEngine[key];
        });
        
        if (!engine.init || !engine.loadNet) {
            return fail("FoldEngine이 초기화되지 않았습니다.");
        }
        
        // --- 가상 Three.js 환경 재구축 (TypeError 방지) ---
        engine.init = function(canvas) {
            engine.scene = new THREE.Scene();
            engine.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
            engine.camera.position.set(0, 0, 8); 
            engine.camera.lookAt(new THREE.Vector3(0, 0, 0));
            
            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(4, 5, 6);
            
            engine.scene.add(engine.camera);
            engine.scene.add(light);
            engine.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        };
        // --- 끝 ---

        engine.init(dummyCanvas);
        engine.loadNet(net); 

        const groups = engine.getFaceGroups();
        if (groups.length <= 1) return true; 

        function buildTreeSim() {
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
        
        const { parent, order } = buildTreeSim();
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);

        try {
            // 동기 Fold 시뮬레이션
            groups.forEach(group => {
                if (group.userData.initialPos) {
                    group.position.copy(group.userData.initialPos);
                }
                group.rotation.set(0, 0, 0); 
            });

            engine.scene.updateMatrixWorld(true);
            
            const centerOffsetSim = new THREE.Vector3(0,0,0); 

            order.forEach(faceId => {
                const p = parent[faceId];
                if (p === -1) return;

                const parentGroup = groups.find(g => g.faceId === p);
                const childGroup = groups.find(g => g.faceId === faceId);
                
                if (!parentGroup || !childGroup) return;

                const relation = adj[p].find(x => x.to === faceId);
                const parentFaceObj = faces.find(f => f.id === p);
                
                // getAxisAndPointSim 
                const parentEdges = getEdges(parentFaceObj);
                const edge = parentEdges[relation.edgeA];
                
                const p1 = new THREE.Vector3(edge.a[0], -edge.a[1], 0);
                const p2 = new THREE.Vector3(edge.b[0], -edge.b[1], 0);
                
                const axis = new THREE.Vector3().subVectors(p2, p1).normalize();
                const point = p1; 
                
                const worldPoint = point.clone().sub(centerOffsetSim); 
                
                // ⭐ 오류 해결: childGroup의 matrixWorld를 명시적으로 업데이트
                childGroup.updateMatrixWorld(true); 

                const invMatrix = new THREE.Matrix4().getInverse(childGroup.matrixWorld);
                const localPoint = worldPoint.clone().applyMatrix4(invMatrix);

                childGroup.position.sub(localPoint);
                
                const localAxis = axis.clone().transformDirection(childGroup.matrixWorld.getInverse());
                
                const angle = Math.PI / 2;
                childGroup.rotateOnAxis(localAxis, angle);
                
                childGroup.position.add(localPoint);
            });
            
            engine.scene.updateMatrixWorld(true);

        } catch (err) {
            console.warn("Simulator Fold Error:", err);
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
             groups[0].parent.updateMatrixWorld(true);
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
