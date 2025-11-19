/**
 * cube_nets.js
 *
 * 정육면체 전개도(6칸짜리 육소미노) 패턴 11개 정의
 * - 각 패턴은 격자 좌표(u, v)와 인접 정보(adjacency)를 가짐
 * - window.CubeNets 로 export
 */

(function () {
    'use strict';

    // 6개 면에 사용할 고정 색상 팔레트 (id 0 ~ 5)
    const PALETTE = [
        "#FFD54F", // 0 노랑
        "#81C784", // 1 초록
        "#64B5F6", // 2 파랑
        "#BA68C8", // 3 보라
        "#F48FB1", // 4 분홍
        "#FF8A65"  // 5 주황
    ];

    // 각 전개도 패턴의 셀 좌표 (u, v)
    const RAW_NETS = [
        {
            id: 'net01',
            label: '패턴 1',
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [1, 2],
                [2, 1],
                [3, 1]
            ]
        },
        {
            id: 'net02',
            label: '패턴 2',
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [1, 2],
                [1, 3],
                [2, 1]
            ]
        },
        {
            id: 'net03',
            label: '패턴 3',
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
                [2, 1],
                [3, 1],
                [3, 2]
            ]
        },
        {
            id: 'net04',
            label: '패턴 4',
            cells: [
                [0, 1],
                [1, 1],
                [2, 0],
                [2, 1],
                [2, 2],
                [3, 0]
            ]
        },
        {
            id: 'net05',
            label: '패턴 5',
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [2, 1],
                [2, 2],
                [3, 1]
            ]
        },
        {
            id: 'net06',
            label: '패턴 6',
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
                [2, 1],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net07',
            label: '패턴 7',
            cells: [
                [0, 0],
                [1, 0],
                [1, 1],
                [2, 1],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net08',
            label: '패턴 8',
            cells: [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 2],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net09',
            label: '패턴 9',
            cells: [
                [0, 2],
                [1, 1],
                [1, 2],
                [2, 0],
                [2, 1],
                [3, 0]
            ]
        },
        {
            id: 'net10',
            label: '패턴 10',
            cells: [
                [0, 1],
                [1, 1],
                [2, 0],
                [2, 1],
                [2, 2],
                [3, 2]
            ]
        },
        {
            id: 'net11',
            label: '패턴 11',
            cells: [
                [0, 1],
                [1, 1],
                [2, 1],
                [2, 2],
                [3, 0],
                [3, 1]
            ]
        }
    ];

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // 셀 배열 → faces + adjacency 생성
    function buildNetFromCells(rawNet) {
        const faces = rawNet.cells.map(([u, v], idx) => ({
            id: idx,
            u,
            v,
            w: 1,
            h: 1,
            color: PALETTE[idx]   // ⭐ 색을 id에 고정
        }));

        const adjacency = [];

        for (let i = 0; i < faces.length; i++) {
            for (let j = i + 1; j < faces.length; j++) {
                const a = faces[i];
                const b = faces[j];
                const du = b.u - a.u;
                const dv = b.v - a.v;
                const manhattan = Math.abs(du) + Math.abs(dv);

                if (manhattan === 1) {
                    let dirAB, dirBA;
                    if (du === 1 && dv === 0) {
                        dirAB = 'right';
                        dirBA = 'left';
                    } else if (du === -1 && dv === 0) {
                        dirAB = 'left';
                        dirBA = 'right';
                    } else if (du === 0 && dv === 1) {
                        dirAB = 'down';
                        dirBA = 'up';
                    } else if (du === 0 && dv === -1) {
                        dirAB = 'up';
                        dirBA = 'down';
                    }

                    adjacency.push({ from: a.id, to: b.id, dir: dirAB });
                    adjacency.push({ from: b.id, to: a.id, dir: dirBA });
                }
            }
        }

        return {
            id: rawNet.id,
            label: rawNet.label,
            faces,
            adjacency
        };
    }

    // 정규화 키 (중복 패턴 제거용, 지금은 참고용)
    function normalizeNet(net) {
        const cells = net.faces.map(f => [f.u, f.v]);

        function normalizeCells(cellsArr) {
            const xs = cellsArr.map(c => c[0]);
            const ys = cellsArr.map(c => c[1]);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const shifted = cellsArr.map(([x, y]) => [x - minX, y - minY]);
            shifted.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
            return shifted;
        }

        function rotate90([x, y]) {
            return [-y, x];
        }

        function allSymmetries(cellsArr) {
            const variants = [];
            for (let rot = 0; rot < 4; rot++) {
                let rotated = cellsArr.map(c => c);
                for (let r = 0; r < rot; r++) {
                    rotated = rotated.map(rotate90);
                }

                const normal = normalizeCells(rotated);
                const flipped = normalizeCells(rotated.map(([x, y]) => [x, -y]));
                variants.push(normal);
                variants.push(flipped);
            }

            const uniq = [];
            const seen = new Set();
            for (const v of variants) {
                const key = JSON.stringify(v);
                if (!seen.has(key)) {
                    seen.add(key);
                    uniq.push(v);
                }
            }
            return uniq;
        }

        const variantCells = allSymmetries(cells);
        const keys = variantCells.map(v => JSON.stringify(v));
        keys.sort();
        return keys[0];
    }

    const nets = RAW_NETS.map(buildNetFromCells);
    const netById = {};
    nets.forEach(net => {
        netById[net.id] = net;
        net.normalizeKey = normalizeNet(net);
    });

    function getRandomNet() {
        const idx = Math.floor(Math.random() * nets.length);
        return deepClone(nets[idx]);
    }

    function getNetById(id) {
        const base = netById[id];
        return base ? deepClone(base) : null;
    }

    function cloneNet(net) {
        return deepClone(net);
    }

    // 전개도 완성하기: 임의의 한 face를 "빠진 조각"으로 선택
    function getRandomPieceProblem() {
        const net = getRandomNet();
        if (!net.faces || net.faces.length !== 6) {
            throw new Error('CubeNets: 잘못된 정육면체 전개도 데이터입니다.');
        }
        const removeIndex = Math.floor(Math.random() * net.faces.length);
        const removedFaceId = net.faces[removeIndex].id;

        // UI에서 사용할 수 있도록 net에 표시
        net.removedFaceId = removedFaceId;

        return {
            kind: 'cube-piece',
            net,
            removedFaceId
        };
    }

    // 겹침 찾기(기존 구조 유지)
    function getRandomOverlapProblem(overlapMode) {
        const net = getRandomNet();
        let type;
        if (overlapMode === 'point' || overlapMode === 'edge') {
            type = overlapMode;
        } else {
            type = Math.random() < 0.5 ? 'point' : 'edge';
        }

        return {
            kind: 'cube-overlap',
            net,
            overlapType: type
        };
    }

    window.CubeNets = {
        nets,
        getRandomNet,
        getNetById,
        cloneNet,
        normalizeNet,
        getRandomPieceProblem,
        getRandomOverlapProblem
    };
})();
