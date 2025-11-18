/**
 * validator.js – 정육면체 전개도 검증
 *  - 정답 기준: CubeNets에 등록된 11개 전개도와 같은 모양인지
 */

(function () {
    'use strict';

    const Validator = {};
    window.Validator = Validator;

    Validator.lastError = "";
    const EPS = 1e-6;

    function fail(msg) {
        Validator.lastError = msg;
        return false;
    }

    function validateFacesBasic(net) {
        if (!net || !Array.isArray(net.faces)) {
            return fail("전개도 데이터가 올바르지 않습니다.");
        }

        if (net.faces.length !== 6) {
            return fail(`전개도는 반드시 6개의 정사각형(면)으로 이루어져야 합니다. (현재: ${net.faces.length}개)`);
        }

        const idSet = new Set();
        for (const f of net.faces) {
            if (typeof f.id !== 'number') {
                return fail("face id가 숫자가 아닙니다.");
            }
            if (idSet.has(f.id)) {
                return fail("중복된 face id가 있습니다: " + f.id);
            }
            idSet.add(f.id);

            if (f.w !== 1 || f.h !== 1) {
                return fail("정육면체 전개도의 각 면은 1×1 정사각형이어야 합니다.");
            }
        }
        return true;
    }

    function validateAdjacencyAndConnectivity(net) {
        const faces = net.faces;
        const maxId = faces.reduce((m, f) => Math.max(m, f.id), -1);
        const adj = [...Array(maxId + 1)].map(() => []);

        function getEdges(f) {
            const { u, v, w, h } = f;
            return [
                { a: [u, v],     b: [u + w, v] },
                { a: [u + w, v], b: [u + w, v + h] },
                { a: [u + w, v + h], b: [u, v + h] },
                { a: [u, v + h], b: [u, v] }
            ];
        }

        function edgeLength(edge) {
            const [x1, y1] = edge.a;
            const [x2, y2] = edge.b;
            const dx = x2 - x1;
            const dy = y2 - y1;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function sameEdge(e1, e2) {
            return (
                Math.abs(e1.a[0] - e2.b[0]) < EPS &&
                Math.abs(e1.a[1] - e2.b[1]) < EPS &&
                Math.abs(e1.b[0] - e2.a[0]) < EPS &&
                Math.abs(e1.b[1] - e2.a[1]) < EPS
            );
        }

        for (let i = 0; i < faces.length; i++) {
            const fi = faces[i];
            const Ei = getEdges(fi);

            for (let j = i + 1; j < faces.length; j++) {
                const fj = faces[j];
                const Ej = getEdges(fj);

                for (let ei = 0; ei < 4; ei++) {
                    for (let ej = 0; ej < 4; ej++) {
                        if (sameEdge(Ei[ei], Ej[ej])) {
                            if (Math.abs(edgeLength(Ei[ei]) - edgeLength(Ej[ej])) > EPS) {
                                return fail("두 면의 접촉 edge 길이가 일치하지 않습니다.");
                            }
                            adj[fi.id].push({ to: fj.id });
                            adj[fj.id].push({ to: fi.id });
                        }
                    }
                }
            }
        }

        let totalConnections = 0;
        adj.forEach(a => totalConnections += a.length);
        totalConnections = totalConnections / 2;
        if (totalConnections !== 5) {
            return fail(`면들은 정확히 5개의 변에서 서로 이어져야 합니다. (현재 연결 수: ${totalConnections})`);
        }

        // 연결 그래프인지 체크
        const ids = faces.map(f => f.id);
        const visited = {};
        ids.forEach(id => visited[id] = false);

        const start = ids[0];
        const queue = [start];
        visited[start] = true;

        while (queue.length) {
            const f = queue.shift();
            adj[f].forEach(n => {
                if (!visited[n.to]) {
                    visited[n.to] = true;
                    queue.push(n.to);
                }
            });
        }

        for (const id of ids) {
            if (!visited[id]) {
                return fail("전개도 면들이 하나로 연결되어 있지 않습니다.");
            }
        }

        return true;
    }

    function validateShapeByLibrary(net) {
        if (!window.CubeNets || !Array.isArray(window.CubeNets.nets)) {
            return fail("CubeNets 데이터가 로드되지 않았습니다.");
        }

        const clone = window.CubeNets.cloneNet(net);
        const key = window.CubeNets.normalizeNet(clone);

        const ok = window.CubeNets.nets.some(base => base.normalizeKey === key);
        if (!ok) {
            return fail("이 전개도는 준비된 정육면체 전개도 11개 중 어떤 것과도 같은 모양이 아닙니다.");
        }

        return true;
    }

    Validator.validateNet = function (net) {
        Validator.lastError = "";

        if (!validateFacesBasic(net)) return false;
        if (!validateAdjacencyAndConnectivity(net)) return false;
        if (!validateShapeByLibrary(net)) return false;

        return true;
    };

})();
