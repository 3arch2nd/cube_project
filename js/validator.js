/**
 * validator.js – 정육면체 전개도 검증 (2D 전개도 전용, Babylon/Three 의존성 제거 버전)
 *
 *  validateNet(net) → true / false
 *  오류 메시지: Validator.lastError
 *
 * 검사 단계:
 *   1) 면 수 / id / 크기 검증 (6개, 양수 w,h)
 *   2) 2D adjacency(면 맞닿음) 계산 → 연결 구조가 트리인지 검사
 *
 *  ※ 이전 버전의 3D 접기(FoldEngine) + THREE 기반 모서리 검사는
 *    현재 Babylon 평면 엔진 구조와 맞지 않으므로 제거했습니다.
 */

(function () {
    "use strict";

    const Validator = {};
    window.Validator = Validator;

    Validator.lastError = "";
    const EPS = 1e-6;

    function fail(msg) {
        Validator.lastError = msg;
        return false;
    }

    // ------------------------------------------------------------
    // (0) Edge 헬퍼
    // ------------------------------------------------------------
    function getEdges(f) {
        const { u, v, w, h } = f;
        return [
            { a:[u,     v    ], b:[u+w, v    ] }, // 위
            { a:[u+w,   v    ], b:[u+w, v+h  ] }, // 오른쪽
            { a:[u+w,   v+h  ], b:[u,   v+h  ] }, // 아래
            { a:[u,     v+h  ], b:[u,   v    ] }  // 왼쪽
        ];
    }

    function edgeLength(e) {
        const dx = e.b[0] - e.a[0];
        const dy = e.b[1] - e.a[1];
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

    // ------------------------------------------------------------
    // (1) 면 검증
    // ------------------------------------------------------------
    function validateFaces(net) {
        if (!net || !Array.isArray(net.faces)) {
            return fail("전개도 데이터 구조가 잘못되었습니다.");
        }

        // 숨겨진 face(_hidden)는 포함해서 6개인지 검사
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        if (faces.length !== 6)
            return fail(`면은 반드시 6개여야 합니다. (현재 ${faces.length}개)`);

        const idSet = new Set();
        for (const f of faces) {
            if (typeof f.id !== "number")
                return fail("면 id가 숫자가 아닙니다.");

            if (idSet.has(f.id))
                return fail(`중복된 id: ${f.id}`);

            idSet.add(f.id);

            if (f.w <= 0 || f.h <= 0)
                return fail("면 크기 w,h 가 0보다 커야 합니다.");
        }

        return true;
    }

    // ------------------------------------------------------------
    // (2) adjacency 구축 (2D에서 변이 정확히 맞닿는 면들 찾기)
    // ------------------------------------------------------------
    function buildAdjacency(net) {
        const faces = net.faces;
        const maxId = faces.reduce((m, f) => Math.max(m, f.id), -1);
        const adj = [...Array(maxId + 1)].map(() => []);

        for (let i = 0; i < faces.length; i++) {
            const Ei = getEdges(faces[i]);

            for (let j = i + 1; j < faces.length; j++) {
                const Ej = getEdges(faces[j]);

                for (let a = 0; a < 4; a++) {
                    for (let b = 0; b < 4; b++) {
                        if (sameEdge(Ei[a], Ej[b])) {

                            if (Math.abs(edgeLength(Ei[a]) - edgeLength(Ej[b])) > EPS) {
                                return fail("맞닿은 변의 길이가 서로 다릅니다.");
                            }

                            adj[faces[i].id].push({ to: faces[j].id, edgeA: a, edgeB: b });
                            adj[faces[j].id].push({ to: faces[i].id, edgeA: b, edgeB: a });
                        }
                    }
                }
            }
        }

        // 총 연결수 = 5 이어야 함 (정육면체 전개도는 트리 형태)
        let total = 0;
        adj.forEach(a => total += a.length);
        total /= 2;

        if (total !== 5)
            return fail(`면 연결 수가 5가 아닙니다. (현재 ${total})`);

        return adj;
    }

    // ------------------------------------------------------------
    // (3) adjacency 연결성이 트리 구조인지 확인
    // ------------------------------------------------------------
    function checkConnectivity(adj) {
        const ids = Object.keys(adj)
            .map(x => Number(x))
            .filter(id => adj[id].length > 0);

        if (ids.length !== 6)
            return fail("일부 면은 다른 면과 전혀 연결되어 있지 않습니다.");

        const visited = {};
        ids.forEach(id => visited[id] = false);
        const start = ids[0];

        const Q = [start];
        visited[start] = true;

        while (Q.length) {
            const f = Q.shift();
            adj[f].forEach(n => {
                if (!visited[n.to]) {
                    visited[n.to] = true;
                    Q.push(n.to);
                }
            });
        }

        for (const id of ids) {
            if (!visited[id])
                return fail("모든 면이 하나로 연결되어 있지 않습니다.");
        }

        return true;
    }

    // ------------------------------------------------------------
    // (4) 공개 API: validateNet
    // ------------------------------------------------------------
    Validator.validateNet = function (net) {
        Validator.lastError = "";

        // 1) 기본 면 검증
        if (!validateFaces(net)) return false;

        // 2) adjacency 만들기
        const adj = buildAdjacency(net);
        if (!adj) return false;

        // 3) 연결성 검사
        if (!checkConnectivity(adj)) return false;

        // 여기서는 2D 전개도 기준 검사까지만 수행
        // (3D 접힘/겹침 검사는 Babylon FoldEngine이 평면 엔진이라 제거)
        return true;
    };

})();
