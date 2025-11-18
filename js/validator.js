/**
 * validator.js – 정육면체 전개도 검증 (최신 안정 강화 버전)
 *
 *  validateNet(net) → true / false
 *  오류 메시지: Validator.lastError
 *
 * 검사 단계:
 *   1) 면 수 / id / 크기 검증 (6개, 양수 w,h)
 *   2) 2D adjacency(면 맞닿음) 계산 → 연결 구조가 트리인지 검사
 *   3) FoldEngine을 이용해 실제 3D로 접기 (즉시)
 *   4) 3D edge들을 모두 모아 "정확히 12개의 모서리가 각각 2번씩 등장"하는지 검사
 *      → 구멍, 비정상 접힘 완벽하게 검출
 *   5) Overlap.noOverlapCheck() 로 면 끼리 침범 여부 검사
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
            { a:[u,     v    ], b:[u+w, v    ] },
            { a:[u+w,   v    ], b:[u+w, v+h  ] },
            { a:[u+w,   v+h  ], b:[u,   v+h  ] },
            { a:[u,     v+h  ], b:[u,   v    ] }
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
    // (4) FoldEngine 즉시 접기 → 3D face group 얻기
    // ------------------------------------------------------------
    function foldAndGetGroups() {
        const engine = window.FoldEngine;
        if (!engine ||
            typeof engine.foldStaticTo !== "function" ||
            typeof engine.getFaceGroups !== "function") {
            return fail("FoldEngine이 올바르게 로드되지 않았습니다.");
        }

        // 90도(π/2)까지 즉시 접기 - 정확한 형태 확인
        engine.foldStaticTo(Math.PI / 2);

        const groups = engine.getFaceGroups();
        if (!groups || groups.length !== 6) {
            return fail("3D 접기 중 오류: face group 수가 6이 아닙니다.");
        }

        // 안전: 행렬 갱신
        if (engine.scene) engine.scene.updateMatrixWorld(true);

        return groups;
    }

    // ------------------------------------------------------------
    // (5) 3D edge → key로 만들어 등장 횟수 체크
    //     • 정육면체면 모서리 12개
    //     • 각 edge는 정확히 2번 등장해야 함
    // ------------------------------------------------------------
    function makeEdgeKey(a, b) {
        // world 좌표를 소수점 3자리로 normalize
        function q(v) {
            return [
                Math.round(v.x * 1000) / 1000,
                Math.round(v.y * 1000) / 1000,
                Math.round(v.z * 1000) / 1000
            ];
        }

        const pa = q(a);
        const pb = q(b);

        // 방향성 제거 (정렬)
        const firstIsA =
            pa[0] < pb[0] ||
            (pa[0] === pb[0] && pa[1] < pb[1]) ||
            (pa[0] === pb[0] && pa[1] === pb[1] && pa[2] <= pb[2]);

        const p1 = firstIsA ? pa : pb;
        const p2 = firstIsA ? pb : pa;

        return `${p1[0]},${p1[1]},${p1[2]}|${p2[0]},${p2[1]},${p2[2]}`;
    }

    function checkClosedByEdges(groups) {
        const edges = [];

        // local plane corners
        const localCorners = [
            new THREE.Vector3(-0.5, -0.5, 0),
            new THREE.Vector3( 0.5, -0.5, 0),
            new THREE.Vector3( 0.5,  0.5, 0),
            new THREE.Vector3(-0.5,  0.5, 0)
        ];

        // 각 face 4개의 모서리 world 좌표 계산
        for (const g of groups) {
            const wc = localCorners.map(c =>
                c.clone().applyMatrix4(g.matrixWorld)
            );

            const idxPairs = [
                [0,1], [1,2], [2,3], [3,0]
            ];

            for (const [i1, i2] of idxPairs) {
                edges.push({
                    a: wc[i1],
                    b: wc[i2]
                });
            }
        }

        // edge key counting
        const counts = new Map();

        for (const e of edges) {
            const key = makeEdgeKey(e.a, e.b);
            counts.set(key, (counts.get(key) || 0) + 1);
        }

        // 정육면체는 모서리 12개
        if (counts.size !== 12)
            return fail("모서리 개수가 12개가 아닙니다. (구멍/뚫림/잘못된 접힘)");

        // 모든 edge 등장횟수는 정확히 2번이어야 함
        for (const cnt of counts.values()) {
            if (cnt !== 2) {
                return fail("정육면체가 완전히 닫히지 않았습니다. (어떤 모서리는 1회 또는 3회 이상 등장)");
            }
        }

        return true;
    }

    // ------------------------------------------------------------
    // (6) 겹침 없음 검사
    // ------------------------------------------------------------
    function checkNoOverlap() {
        if (!window.Overlap || typeof window.Overlap.noOverlapCheck !== "function") {
            // Overlap 모듈이 없으면 생략 (실패로 보지 않음)
            return true;
        }

        const ok = window.Overlap.noOverlapCheck();
        if (!ok) {
            return fail("접었을 때 면끼리 서로 겹칩니다.");
        }
        return true;
    }

    
    // ------------------------------------------------------------
    // (7) 공개 API: validateNet
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

        // 4) 3D 즉시 접기 + face groups 획득
        const groups = foldAndGetGroups();
        if (!groups) {
            // fold 과정에서 fail() 메시지 이미 기록됨
            if (window.FoldEngine && window.FoldEngine.unfoldImmediate) {
                window.FoldEngine.unfoldImmediate();
            }
            return false;
        }

        // 5) "닫힌 정육면체인지" 검사
        const closedOK = checkClosedByEdges(groups);

        // 6) "면끼리 겹치지 않는지" 검사
        const overlapOK = closedOK && checkNoOverlap();

        // 7) 끝 → 평면 상태로 복구
        if (window.FoldEngine && window.FoldEngine.unfoldImmediate) {
            window.FoldEngine.unfoldImmediate();
        }

        if (!closedOK || !overlapOK) {
            return false;
        }

        return true;
    };

})();

 
