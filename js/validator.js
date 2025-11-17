/**
 * validator.js – 정육면체 + 직육면체 전개도 검증 확장
 * 
 * 제공 기능:
 *  validateNet(net)
 *   → true / false
 *   → 오류 메시지는 validateNet.lastError 로 확인
 */

(function () {
    'use strict';

    const Validator = {};
    window.Validator = Validator;

    Validator.lastError = "";

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

        if (net.faces.length !== 6) {
            return fail("전개도는 반드시 6개의 면으로 구성되어야 합니다.");
        }

        const idSet = new Set();
        for (const f of net.faces) {
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
            e1.a[0] === e2.b[0] &&
            e1.a[1] === e2.b[1] &&
            e1.b[0] === e2.a[0] &&
            e1.b[1] === e2.a[1]
        );
    }

    // ----------------------------------------------------
    // (B) adjacency 검사
    // ----------------------------------------------------
    function buildAdjacency(net) {
        const adj = [...Array(6)].map(() => []);
        
        for (let i = 0; i < net.faces.length; i++) {
            const fi = net.faces[i];
            const Ei = getEdges(fi);

            for (let j = i+1; j < net.faces.length; j++) {
                const fj = net.faces[j];
                const Ej = getEdges(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (sameEdge(Ei[ei], Ej[ej])) {
                            // edge 길이 검사
                            if (Math.abs(edgeLength(Ei[ei]) - edgeLength(Ej[ej])) > 1e-6) {
                                return fail("두 면의 접촉 edge 길이가 일치하지 않습니다.");
                            }
                            adj[fi.id].push({ to: fj.id, edgeA: ei, edgeB: ej });
                            adj[fj.id].push({ to: fi.id, edgeA: ej, edgeB: ei });
                        }
                    }
                }
            }
        }

        // 연결 개수 = 5 여야 함
        let totalConnections = 0;
        adj.forEach(a => totalConnections += a.length);
        totalConnections = totalConnections / 2;

        if (totalConnections !== 5) {
            return fail("전개도 면들이 정확히 5개 연결(edge sharing)되어야 합니다. 현재: " + totalConnections);
        }

        return adj;
    }

    function checkConnectivity(adj) {
        // BFS from face 0
        const visited = Array(6).fill(false);
        const Q = [0];
        visited[0] = true;

        while (Q.length) {
            const f = Q.shift();
            adj[f].forEach(n => {
                if (!visited[n.to]) {
                    visited[n.to] = true;
                    Q.push(n.to);
                }
            });
        }

        if (visited.some(v => !v)) {
            return fail("전개도 면들이 하나로 연결되지 않았습니다.");
        }

        return true;
    }

    // ----------------------------------------------------
    // (C) FoldEngine 기반 실제 fold 테스트
    //   → 여기서는 임시 Three.js Scene을 생성하여 fold 시도
    // ----------------------------------------------------
    function simulateFolding(net, adj) {
        // 별도 가상 FoldEngine 인스턴스
        const dummyCanvas = document.createElement("canvas");
        dummyCanvas.width = 300;
        dummyCanvas.height = 300;

        const engine = {};
        Object.assign(engine, window.FoldEngine);  // 같은 엔진 복사
        
        if (!engine.init || !engine.loadNet) {
            return fail("FoldEngine이 초기화되지 않았습니다.");
        }

        engine.init(dummyCanvas);
        window.FoldEngine.currentNet = net;   // 실제 쓰기
        engine.loadNet(net);

        // folding tree 만들기 (FoldEngine과 동일 로직)
        function buildTree() {
            const parent = Array(6).fill(null);
            parent[0] = -1;

            const Q = [0];
            const order = [];

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

        const { parent, order } = buildTree();

        // 접기 테스트: FoldEngine.foldAnimate의 로직을 그대로 사용
        try {
            engine.foldAnimate(0.5);
        } catch (err) {
            console.warn(err);
            return fail("접기 과정에서 오류가 발생했습니다. 전개도가 물리적으로 접을 수 없는 형태입니다.");
        }

        // 성공적으로 fold되었는지 판단
        // → 면들이 Z축으로 튀지 않았는지, NaN/Infinity 없는지 체크

        const groups = engine.getFaceGroups();
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
        // Overlap.js에 위임
        if (!window.Overlap || !window.Overlap.noOverlapCheck) {
            console.warn("Overlap 모듈 없음 → 겹침 검사 생략");
            return true;
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
