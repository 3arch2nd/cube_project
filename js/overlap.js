/**
 * overlap.js – 직육면체 + 정육면체 겹침 판정 완전 확장 버전
 *
 * 기능:
 *   Overlap.startSelection(net)
 *   Overlap.recordClick(u,v)
 *   Overlap.getSelections()
 *   Overlap.checkUserAnswer(net)
 *   Overlap.noOverlapCheck()     // validator.js에서 충돌 검사용
 */

(function () {
    "use strict";

    const Overlap = {};
    window.Overlap = Overlap;

    // ----------------------------
    // 상태 변수
    // ----------------------------
    let currentNet = null;
    let first = null;
    let second = null;

    // ----------------------------
    // selections 조회
    // ----------------------------
    Overlap.getSelections = () => ({ first, second });

    // ----------------------------
    // 초기화
    // ----------------------------
    Overlap.startSelection = function (net) {
        currentNet = net;
        first = null;
        second = null;
    };

    // ----------------------------
    // canvas click로 (u,v) 선택
    // ----------------------------
    Overlap.recordClick = function (u, v) {
        if (!first) {
            first = detectElement(u, v);
            return "first";
        } else if (!second) {
            second = detectElement(u, v);
            return "second";
        }
        return null;
    };

    // ============================================================
    // 1. 전개도 상의 점/선 선택 감지
    // ============================================================

    function detectElement(u, v) {
        /**
         * 전개도 좌표 (u,v)를 기준으로
         * vertex / edge 를 클릭했는지 판단.
         *
         * 직육면체 지원을 위해 w,h 크기 반영.
         */
        const eps = 0.2;

        for (const f of currentNet.faces) {
            const x0 = f.u;
            const y0 = f.v;
            const x1 = f.u + f.w;
            const y1 = f.v + f.h;

            // --- Vertex 판정 ---
            const verts = [
                { x:x0, y:y0 },
                { x:x1, y:y0 },
                { x:x1, y:y1 },
                { x:x0, y:y1 }
            ];
            for (const vt of verts) {
                if (Math.abs(u - vt.x) < eps && Math.abs(v - vt.y) < eps) {
                    return {
                        type: "vertex",
                        face: f.id,
                        x: vt.x,
                        y: vt.y
                    };
                }
            }

            // --- Edge 판정 ---
            const edgeEps = 0.2;

            // top
            if (v > y0 - edgeEps && v < y0 + edgeEps && (u >= x0 && u <= x1))
                return { type:"edge", face:f.id, edge:0 };
            // right
            if (u > x1 - edgeEps && u < x1 + edgeEps && (v >= y0 && v <= y1))
                return { type:"edge", face:f.id, edge:1 };
            // bottom
            if (v > y1 - edgeEps && v < y1 + edgeEps && (u >= x0 && u <= x1))
                return { type:"edge", face:f.id, edge:2 };
            // left
            if (u > x0 - edgeEps && u < x0 + edgeEps && (v >= y0 && v <= y1))
                return { type:"edge", face:f.id, edge:3 };
        }

        return null;
    }

    // ============================================================
    // 2. 3D world 좌표 변환 함수들
    // ============================================================

    function getWorldVector(faceId, u, v) {
        const groups = FoldEngine.getFaceGroups();
        if (!groups) return null;

        const g = groups.find(obj => obj.faceId === faceId);
        if (!g) return null;

        const f = currentNet.faces.find(x => x.id === faceId);

        // face의 local 좌표: 중심 기준
        const lx = u - (f.u + f.w / 2);
        const ly = -(v - (f.v + f.h / 2));
        const lz = 0;

        const local = new THREE.Vector3(lx, ly, lz);
        const world = local.applyMatrix4(g.matrixWorld);
        return world;
    }

    // vertex world pos
    function vertexWorldPos(face, ux, vy) {
        return getWorldVector(face.id, ux, vy);
    }

    // edge midpoint world pos
    function edgeWorldPos(face, edgeIndex) {
        const { u, v, w, h } = face;
        let pu = u, pv = v;

        switch (edgeIndex) {
            case 0: pu = u + w/2; pv = v;     break;
            case 1: pu = u + w;   pv = v+h/2; break;
            case 2: pu = u + w/2; pv = v+h;   break;
            case 3: pu = u;       pv = v+h/2; break;
        }

        return getWorldVector(face.id, pu, pv);
    }

    function isSameWorldPosition(a, b) {
        if (!a || !b) return false;
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return (dx*dx + dy*dy + dz*dz) < 0.0005;
    }

    // ============================================================
    // 3. 실제 겹침(정답) 판정
    // ============================================================
    Overlap.checkUserAnswer = function (net) {
        if (!first || !second) return false;

        const f1 = net.faces.find(x => x.id === first.face);
        const f2 = net.faces.find(x => x.id === second.face);

        if (!f1 || !f2) return false;

        // vertex vs vertex
        if (first.type === "vertex" && second.type === "vertex") {
            const p = vertexWorldPos(f1, first.x, first.y);
            const q = vertexWorldPos(f2, second.x, second.y);
            return isSameWorldPosition(p, q);
        }

        // edge vs edge
        if (first.type === "edge" && second.type === "edge") {
            const p = edgeWorldPos(f1, first.edge);
            const q = edgeWorldPos(f2, second.edge);
            return isSameWorldPosition(p, q);
        }

        // 서로 다른 타입은 정답 없음
        return false;
    };

    // ============================================================
    // 4. validator용: 접힘 후 실제 충돌/겹침 여부 검사
    // ============================================================
    Overlap.noOverlapCheck = function () {
        const groups = FoldEngine.getFaceGroups();
        if (!groups) return true;

        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                const gi = new THREE.Box3().setFromObject(groups[i]);
                const gj = new THREE.Box3().setFromObject(groups[j]);

                if (gi.intersectsBox(gj)) {
                    const ci = gi.getCenter(new THREE.Vector3());
                    const cj = gj.getCenter(new THREE.Vector3());
                    const d2 = ci.distanceToSquared(cj);

                    // 너무 가까우면 충돌로 간주 (면끼리 overlapping)
                    if (d2 < 0.001) return false;
                }
            }
        }
        return true;
    };

})();
