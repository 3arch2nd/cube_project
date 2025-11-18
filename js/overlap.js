/**
 * overlap.js – 정육면체 겹쳐지는 점/선 찾기
 */

(function () {
    "use strict";

    const Overlap = {};
    window.Overlap = Overlap;

    let currentNet = null;
    let first = null;
    let second = null;

    Overlap.getSelections = () => ({ first, second });

    Overlap.startSelection = function (net) {
        currentNet = net;
        first = null;
        second = null;
    };

    Overlap.recordClick = function (u, v) {
        if (!currentNet) return null;

        const elem = detectElement(u, v);
        if (!elem) return null;

        if (!first) {
            first = elem;
            return "first";
        } else if (!second) {
            second = elem;
            return "second";
        }
        return null;
    };

    function detectElement(u, v) {
        const eps = 0.2;

        for (const f of currentNet.faces) {
            const x0 = f.u;
            const y0 = f.v;
            const x1 = f.u + f.w;
            const y1 = f.v + f.h;

            const verts = [
                { x: x0, y: y0 },
                { x: x1, y: y0 },
                { x: x1, y: y1 },
                { x: x0, y: y1 }
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

            const edgeEps = 0.2;
            if (v > y0 - edgeEps && v < y0 + edgeEps && (u >= x0 && u <= x1))
                return { type: "edge", face: f.id, edge: 0 };
            if (u > x1 - edgeEps && u < x1 + edgeEps && (v >= y0 && v <= y1))
                return { type: "edge", face: f.id, edge: 1 };
            if (v > y1 - edgeEps && v < y1 + edgeEps && (u >= x0 && u <= x1))
                return { type: "edge", face: f.id, edge: 2 };
            if (u > x0 - edgeEps && u < x0 + edgeEps && (v >= y0 && v <= y1))
                return { type: "edge", face: f.id, edge: 3 };
        }

        return null;
    }

    function getWorldVector(faceId, u, v) {
        const groups = FoldEngine.getFaceGroups && FoldEngine.getFaceGroups();
        if (!groups) return null;

        const g = groups.find(obj => obj.userData.faceId === faceId || obj.faceId === faceId);
        if (!g) return null;

        const f = currentNet.faces.find(x => x.id === faceId);
        if (!f) return null;

        const lx = u - (f.u + f.w / 2);
        const ly = -(v - (f.v + f.h / 2));
        const lz = 0;

        const local = new THREE.Vector3(lx, ly, lz);
        const world = local.applyMatrix4(g.matrixWorld);
        return world;
    }

    function vertexWorldPos(face, ux, vy) {
        return getWorldVector(face.id, ux, vy);
    }

    function edgeWorldPos(face, edgeIndex) {
        const { u, v, w, h } = face;
        let pu = u, pv = v;

        switch (edgeIndex) {
            case 0: pu = u + w / 2; pv = v; break;
            case 1: pu = u + w;     pv = v + h / 2; break;
            case 2: pu = u + w / 2; pv = v + h; break;
            case 3: pu = u;         pv = v + h / 2; break;
        }

        return getWorldVector(face.id, pu, pv);
    }

    function isSameWorldPosition(a, b) {
        if (!a || !b) return false;
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return (dx * dx + dy * dy + dz * dz) < 0.0005;
    }

    Overlap.checkUserAnswer = function (net) {
        if (!first || !second) return false;
        currentNet = net;

        // 3D에서 정확한 겹침을 보기 위해 즉시 접기
        if (FoldEngine.foldToEndImmediate) {
            FoldEngine.foldToEndImmediate();
        }

        const f1 = net.faces.find(x => x.id === first.face);
        const f2 = net.faces.find(x => x.id === second.face);
        if (!f1 || !f2) return false;

        if (first.type === "vertex" && second.type === "vertex") {
            const p = vertexWorldPos(f1, first.x, first.y);
            const q = vertexWorldPos(f2, second.x, second.y);
            return isSameWorldPosition(p, q);
        }

        if (first.type === "edge" && second.type === "edge") {
            const p = edgeWorldPos(f1, first.edge);
            const q = edgeWorldPos(f2, second.edge);
            return isSameWorldPosition(p, q);
        }

        return false;
    };

    Overlap.noOverlapCheck = function () {
        const groups = FoldEngine.getFaceGroups && FoldEngine.getFaceGroups();
        if (!groups) return true;

        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                const gi = new THREE.Box3().setFromObject(groups[i]);
                const gj = new THREE.Box3().setFromObject(groups[j]);

                if (gi.intersectsBox(gj)) {
                    const ci = gi.getCenter(new THREE.Vector3());
                    const cj = gj.getCenter(new THREE.Vector3());
                    const d2 = ci.distanceToSquared(cj);

                    if (d2 < 0.001) return false;
                }
            }
        }
        return true;
    };

})();
