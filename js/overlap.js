/**
 * overlap.js – 직육면체 + 정육면체 겹침 판정 확장
 *
 * 제공 기능:
 *   Overlap.startSelection(net)
 *   Overlap.recordClick(x,y)
 *   Overlap.getSelections()
 *
 *   Overlap.checkUserAnswer(net)
 *   Overlap.noOverlapCheck()   // validator용
 */

(function () {
    'use strict';

    const Overlap = {};
    window.Overlap = Overlap;

    // ------------------------------
    // 상태
    // ------------------------------
    let currentNet = null;
    let first = null;
    let second = null;

    // ------------------------------
    // 외부에서 selections 접근
    // ------------------------------
    Overlap.getSelections = () => ({ first, second });

    // ------------------------------
    // 초기화
    // ------------------------------
    Overlap.startSelection = function (net) {
        currentNet = net;
        first = null;
        second = null;
    };

    // ------------------------------
    // canvas click → 영역 판정
    // ------------------------------
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

    // -------------------------------------------------------
    // detectElement(u,v): 점 또는 선을 찾는 핵심 함수
    // -------------------------------------------------------
    function detectElement(u, v) {
        /**
         * 전개도 좌표 (u,v) 를 기준으로
         * 어떤 face의 edge, vertex를 클릭했는지 판단한다.
         *
         * 정사각형 전용 → 직육면체로 확장함.
         */

        for (const f of currentNet.faces) {
            const x0 = f.u;
            const y0 = f.v;
            const x1 = f.u + f.w;
            const y1 = f.v + f.h;

            // Vertex tolerance
            const eps = 0.15;

            // 4개 vertex 체크
            const verts = [
                {key:"v", id:f.id, x:x0, y:y0},
                {key:"v", id:f.id, x:x1, y:y0},
                {key:"v", id:f.id, x:x1, y:y1},
                {key:"v", id:f.id, x:x0, y:y1},
            ];
            for (const vtx of verts) {
                if (Math.abs(u - vtx.x) < eps && Math.abs(v - vtx.y) < eps) {
                    return { type:"vertex", face: f.id, x:vtx.x, y:vtx.y };
                }
            }

            // Edge 체크
            const edgeEps = 0.15;

            // top edge
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

    // -------------------------------------------------------
    // 3D world 좌표 변환
    // -------------------------------------------------------
    function getWorldVector(faceId, u, v) {
        const groups = FoldEngine.getFaceGroups();
        const g = groups.find(x => x.faceId === faceId);
        if (!g) return null;

        // face의 local 좌표계: 중심 기준
        const f = currentNet.faces.find(f => f.id === faceId);
        const lx = u - (f.u + f.w / 2);
        const ly = -(v - (f.v + f.h / 2));
        const lz = 0;

        const local = new THREE.Vector3(lx, ly, lz);
        const world = local.applyMatrix4(g.matrixWorld);

        return world;
    }

    // edge midpoint world position
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

    // vertex world pos
    function vertexWorldPos(face, u, v) {
        return getWorldVector(face.id, u, v);
    }

    // -------------------------------------------------------
    // 두 선택 요소의 3D world 좌표 비교
    // -------------------------------------------------------
    function isSameWorldPosition(p, q) {
        if (!p || !q) return false;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dz = p.z - q.z;
        return (dx*dx + dy*dy + dz*dz) < 0.0004;  // 넉넉한 오차
    }

    // -------------------------------------------------------
    // 체크: 두 선택 요소가 겹치는가?
    // -------------------------------------------------------
    Overlap.checkUserAnswer = function (net) {
        if (!first || !second) return false;

        // faceGroups 확보
        const faceGroups = FoldEngine.getFaceGroups();
        if (!faceGroups || faceGroups.length !== 6) return false;

        // vertex vs vertex
        if (first.type === "vertex" && second.type === "vertex") {
            const f1 = currentNet.faces.find(f => f.id === first.face);
            const f2 = currentNet.faces.find(f => f.id === second.face);

            const p = vertexWorldPos(f1, first.x, first.y);
            const q = vertexWorldPos(f2, second.x, second.y);

            return isSameWorldPosition(p, q);
        }

        // edge vs edge
        if (first.type === "edge" && second.type === "edge") {
            const f1 = currentNet.faces.find(f => f.id === first.face);
            const f2 = currentNet.faces.find(f => f.id === second.face);

            const p = edgeWorldPos(f1, first.edge);
            const q = edgeWorldPos(f2, second.edge);

            return isSameWorldPosition(p, q);
        }

        // vertex vs edge → 잘못된 조합
        return false;
    };

    // -------------------------------------------------------
    // validator.js용: 접힘 후 면끼리 겹침 있는지 검사
    // -------------------------------------------------------
    Overlap.noOverlapCheck = function () {
        const groups = FoldEngine.getFaceGroups();

        // bounding box 간 단순 충돌 검사
        for (let i = 0; i < groups.length; i++) {
            for (let j = i+1; j < groups.length; j++) {
                const gi = new THREE.Box3().setFromObject(groups[i]);
                const gj = new THREE.Box3().setFromObject(groups[j]);

                if (gi.intersectsBox(gj)) {
                    // 정육면체/직육면체는 인접 면끼리 붙는 것은 정상 → 중심 거리 확인
                    const ci = gi.getCenter(new THREE.Vector3());
                    const cj = gj.getCenter(new THREE.Vector3());

                    const d2 = ci.distanceToSquared(cj);
                    if (d2 < 0.001) {
                        // 지나치게 가까우면 충돌로 판단
                        return false;
                    }
                }
            }
        }
        return true;
    };

})();
