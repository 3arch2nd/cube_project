/**
 * validator.js – 정육면체 전개도 검증
 *
 *  validateNet(net) → true / false
 *  - 오류 메시지: Validator.lastError
 *
 *  검사 단계:
 *   1) 면 수 / id / 크기 검증 (6개, 양수 w,h)
 *   2) 2D adjacency / 연결성 검사
 *   3) FoldEngine으로 실제 3D 접기 (즉시)
 *   4) 3D edge들을 모아 "모든 edge가 정확히 2번씩 등장"하는지 확인
 *      → 구멍(뚫린 도형) 또는 잘못 접힌 경우를 잡아냄
 *   5) Overlap.noOverlapCheck() 로 면끼리 겹침 검사
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

    // ------------------------------------------------
    // 면의 edge 좌표
    // ------------------------------------------------
    function getEdges(f) {
        const { u, v, w, h } = f;
        return [
            { a:[u,     v    ], b:[u + w, v    ] }, // top
            { a:[u + w, v    ], b:[u + w, v + h] }, // right
            { a:[u + w, v + h], b:[u,     v + h] }, // bottom
            { a:[u,     v + h], b:[u,     v    ] }  // left
        ];
    }

    function edgeLength(e) {
        const [x1, y1] = e.a;
        const [x2, y2] = e.b;
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

    // ------------------------------------------------
    // (1) 면 기초 검증
    // ------------------------------------------------
    function validateFaces(net) {
        if (!net || !Array.isArray(net.faces)) {
            return fail("전개도 데이터가 올바르지 않습니다.");
        }

        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        if (faces.length !== 6) {
            return fail(`전개도는 반드시 6개의 면으로 구성되어야 합니다. (현재 ${faces.length}개)`);
        }

        const idSet = new Set();
        for (const f of faces) {
            if (typeof f.id !== "number") return fail("면 id가 숫자가 아닙니다.");
            if (idSet.has(f.id)) return fail("중복된 face id가 있습니다: " + f.id);
            idSet.add(f.id);
            if (f.w <= 0 || f.h <= 0) return fail("면의 가로/세로 크기가 잘못되었습니다.");
        }

        return true;
    }

    // ------------------------------------------------
    // (2) adjacency / 연결성
    // ------------------------------------------------
    function buildAdjacency(net) {
        const faces = net.faces.filter(f => f && f.w > 0 && f.h > 0);
        const maxId = faces.reduce((m, f) => Math.max(m, f.id), -1);
        const adj = [...Array(maxId + 1)].map(() => []);

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
                                return fail("두 면이 맞닿는 변의 길이가 서로 다릅니다.");
                            }
                            adj[fi.id].push({ to: fj.id, edgeA: ei, edgeB: ej });
                            adj[fj.id].push({ to: fi.id, edgeA: ej, edgeB: ei });
                        }
                    }
                }
            }
        }

        // 전체 연결 edge 수 = 5여야 함 (6면 트리)
        let totalConnections = 0;
        adj.forEach(a => totalConnections += a.length);
        totalConnections /= 2;

        if (totalConnections !== 5) {
            return fail(`전개도 면들 사이의 연결 수가 올바르지 않습니다. (기대값 5, 현재 ${totalConnections})`);
        }

        return adj;
    }

    function checkConnectivity(adj) {
        const ids = [];
        for (let i = 0; i < adj.length; i++) {
            if (Array.isArray(adj[i]) && adj[i].length > 0) ids.push(i);
        }
        if (ids.length !== 6) {
            return fail("일부 면이 다른 면과 전혀 연결되어 있지 않습니다.");
        }

        const visited = Array(adj.length).fill(false);
        const start = ids[0];
        const Q = [start];
        visited[start] = true;

        while (Q.length) {
            const f = Q.shift();
            adj[f].forEach(n => {
                if (n.to < visited.length && !visited[n.to]) {
                    visited[n.to] = true;
                    Q.push(n.to);
                }
            });
        }

        if (ids.some(id => !visited[id])) {
            return fail("전개도 면들이 하나로 연결되어 있지 않습니다.");
        }
        return true;
    }

    // ------------------------------------------------
    // (3) FoldEngine으로 3D 접기 + edge 폐쇄성 검사
    // ------------------------------------------------
    function foldAndGetGroups() {
        const engine = window.FoldEngine;
        if (!engine ||
            typeof engine.foldStaticTo !== "function" ||
            typeof engine.getFaceGroups !== "function") {
            return fail("FoldEngine 모듈이 올바르게 로드되지 않았습니다.");
        }

        // 90도까지 즉시 접기
        engine.foldStaticTo(Math.PI / 2);

        const groups = engine.getFaceGroups();
        if (!groups || groups.length !== 6) {
            return fail("시뮬레이션 중 면 그룹 수가 6이 아닙니다.");
        }

        const scene = engine.scene;
        if (scene) scene.updateMatrixWorld(true);

        return groups;
    }

    function makeEdgeKey(a, b) {
        // 방향성 제거를 위해 두 점을 정렬하고,
        // 좌표를 1/1000 단위로 반올림해서 문자열 키 생성
        function q(v) {
            return [
                Math.round(v.x * 1000) / 1000,
                Math.round(v.y * 1000) / 1000,
                Math.round(v.z * 1000) / 1000
            ];
        }
        const pa = q(a);
        const pb = q(b);

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

        // 각 face의 4꼭지점 (local) → world 변환 후 edge 4개씩 수집
        const localCorners = [
            new THREE.Vector3(-0.5, -0.5, 0),
            new THREE.Vector3( 0.5, -0.5, 0),
            new THREE.Vector3( 0.5,  0.5, 0),
            new THREE.Vector3(-0.5,  0.5, 0)
        ];

        for (const g of groups) {
            const worldCorners = localCorners.map(c =>
                c.clone().applyMatrix4(g.matrixWorld)
            );

            const idxPairs = [
                [0, 1],
                [1, 2],
                [2, 3],
                [3, 0]
            ];

            for (const [i1, i2] of idxPairs) {
                edges.push({
                    a: worldCorners[i1],
                    b: worldCorners[i2]
                });
            }
        }

        // edge들을 key로 묶어서 등장 횟수 확인
        const counts = new Map();
        for (const e of edges) {
            const key = makeEdgeKey(e.a, e.b);
            counts.set(key, (counts.get(key) || 0) + 1);
        }

        // 닫힌 정육면체라면
        //  - 서로 다른 edge key는 12개
        //  - 각 edge는 정확히 2번씩 등장
        if (counts.size !== 12) {
            return fail("정육면체의 12개 모서리가 올바르게 형성되지 않았습니다.");
        }

        for (const cnt of counts.values()) {
            if (cnt !== 2) {
                return fail("정육면체가 완전히 닫혀 있지 않습니다. (어떤 모서리는 1번이거나 3번 이상 등장)");
            }
        }

        return true;
    }

    // ------------------------------------------------
    // (4) Overlap.noOverlapCheck – 면 겹침 검사
    // ------------------------------------------------
    function checkNoOverlap() {
        if (!window.Overlap || typeof window.Overlap.noOverlapCheck !== "function") {
            // 모듈이 없으면 겹침 검사는 생략 (실패로 보진 않음)
            return true;
        }
        const ok = window.Overlap.noOverlapCheck();
        if (!ok) {
            return fail("접었을 때 면끼리 서로 겹칩니다.");
        }
        return true;
    }

    // ------------------------------------------------
    // 공개: validateNet
    // ------------------------------------------------
    Validator.validateNet = function (net) {
        Validator.lastError = "";

        if (!validateFaces(net)) return false;

        const adj = buildAdjacency(net);
        if (!adj) return false;

        if (!checkConnectivity(adj)) return false;

        // 3D로 접어서 검사
        let groups = foldAndGetGroups();
        if (!groups) {
            // foldAndGetGroups 내부에서 fail 처리됨
            // 그래도 상태 복구를 위해 시도
            if (window.FoldEngine && window.FoldEngine.unfoldImmediate) {
                window.FoldEngine.unfoldImmediate();
            }
            return false;
        }

        const closedOK = checkClosedByEdges(groups);
        const overlapOK = closedOK && checkNoOverlap();

        // 다시 평면 상태로 되돌려 둔다 (애니메이션용)
        if (window.FoldEngine && window.FoldEngine.unfoldImmediate) {
            window.FoldEngine.unfoldImmediate();
        }

        if (!closedOK || !overlapOK) {
            return false;
        }

        return true;
    };

})();
