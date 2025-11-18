/**
 * validator.js – 수정된 버전
 * - 연결성 검사 추가
 * - 메시지 단순화
 */

(function () {
    "use strict";

    const Validator = {};
    window.Validator = Validator;

    Validator.lastError = "";

    const EPS = 1e-6;

    // -------------------------------------------------------------
    // 오류 처리
    // -------------------------------------------------------------
    function fail() {
        Validator.lastError = "틀렸습니다. 다시 생각해 볼까요?";
        return false;
    }

    // -------------------------------------------------------------
    // edges
    // -------------------------------------------------------------
    function getEdges(f) {
        return [
            { a: [f.u, f.v], b: [f.u + f.w, f.v] },
            { a: [f.u + f.w, f.v], b: [f.u + f.w, f.v + f.h] },
            { a: [f.u + f.w, f.v + f.h], b: [f.u, f.v + f.h] },
            { a: [f.u, f.v + f.h], b: [f.u, f.v] }
        ];
    }

    function sameEdge(e1, e2) {
        return (
            Math.abs(e1.a[0] - e2.b[0]) < EPS &&
            Math.abs(e1.a[1] - e2.b[1]) < EPS &&
            Math.abs(e1.b[0] - e2.a[0]) < EPS &&
            Math.abs(e1.b[1] - e2.a[1]) < EPS
        );
    }

    // -------------------------------------------------------------
    // 연결성 검사 (뚫린 전개도 방지)
    // -------------------------------------------------------------
    function buildSimpleAdjacency(faces) {
        const adj = [...Array(6)].map(() => []);

        for (let i = 0; i < 6; i++) {
            for (let j = i + 1; j < 6; j++) {
                const A = faces[i];
                const B = faces[j];

                const touching =
                    (A.u === B.u && Math.abs(A.v - B.v) === 1) ||
                    (A.v === B.v && Math.abs(A.u - B.u) === 1);

                if (touching) {
                    adj[i].push(j);
                    adj[j].push(i);
                }
            }
        }
        return adj;
    }

    function isConnected(faces) {
        const adj = buildSimpleAdjacency(faces);
        const visited = Array(6).fill(false);

        function dfs(x) {
            visited[x] = true;
            adj[x].forEach(n => {
                if (!visited[n]) dfs(n);
            });
        }

        dfs(0);
        return visited.every(v => v === true);
    }

    // -------------------------------------------------------------
    // 전체 검증
    // -------------------------------------------------------------
    Validator.validateNet = function (net) {
        Validator.lastError = "";

        if (!net || !Array.isArray(net.faces)) return fail();
        if (net.faces.length !== 6) return fail();

        const faces = net.faces.sort((a, b) => a.id - b.id);

        // 뚫린 도형 방지
        if (!isConnected(faces)) return fail();

        // FoldEngine 시뮬레이션 단계는 그대로 유지
        const ok = Overlap.noOverlapCheck();
        if (!ok) return fail();

        return true;
    };
})();
