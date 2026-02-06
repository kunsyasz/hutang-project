/**
 * ==========================================
 * APLIKASI PENGELOLA HUTANG - MODE CLOUD GAME
 * ==========================================
 */

// ==========================================
// FIREBASE CONFIGURATION (YOU MUST FILL THIS)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAMFhfNrUbSU8lf_k8KMujHMmWpclpT5wI",
    authDomain: "hutang-projecta.firebaseapp.com",
    databaseURL: "https://hutang-projecta-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "hutang-projecta",
    storageBucket: "hutang-projecta.firebasestorage.app",
    messagingSenderId: "707653256428",
    appId: "1:707653256428:web:f3ae1ad279dd2e8e4711c9",
    measurementId: "G-CJ54YDDEP9"
};

let db; // Database instance
let userPath = null; // Path data user: users/NAMA_USER

// ==========================================
// INIT APP (Called after Login)
// ==========================================
function initApp(userId) {
    try {
        const { initializeApp, getDatabase, ref, set, onValue } = window.firebaseLib;
        const app = initializeApp(firebaseConfig);
        db = getDatabase(app);

        userPath = `users/${userId}`;
        console.log(`Connected as ${userId}`);

        // Listen to Realtime Data
        const dataRef = ref(db, userPath);
        onValue(dataRef, (snapshot) => {
            const data = snapshot.val();
            // Update Sync Status Color
            document.getElementById('sync-status').classList.remove('bg-red-500');
            document.getElementById('sync-status').classList.add('bg-green-500');
            document.getElementById('sync-status').title = "Online & Synced";

            if (data) {
                // Reconstruct Objects with Methods
                aplikasiSaya.semuaSumber = data.map(sData => {
                    const s = new SumberHutang(sData.namaSumber);
                    s.id = sData.id;
                    s.isExpanded = sData.isExpanded || false; // Sync expanded state too!
                    s.daftarCicilan = (sData.daftarCicilan || []).map(cData => {
                        const c = new Cicilan(cData.id, cData.bulanKe, cData.tanggalJatuhTempo, cData.nominal, cData.sudahLunas);
                        c.tanggalDibayar = cData.tanggalDibayar ? new Date(cData.tanggalDibayar) : null;
                        return c;
                    });
                    return s;
                });
            } else {
                aplikasiSaya.semuaSumber = []; // Jika data kosong di cloud
            }
            renderUI();
        }, (error) => {
            console.error("Sync Error:", error);
            document.getElementById('sync-status').classList.add('bg-red-500');
            alert("Error Koneksi Database: Cek Konfigurasi Firebase!");
        });

    } catch (e) {
        console.error(e);
        alert("Gagal inisialisasi Firebase. Pastikan Config sudah benar di app.js!");
    }
}

function saveData() {
    if (!db || !userPath) return;

    // Convert Objects to JSON-friendly (remove methods)
    const data = aplikasiSaya.semuaSumber.map(s => ({
        id: s.id,
        namaSumber: s.namaSumber,
        isExpanded: s.isExpanded,
        daftarCicilan: s.daftarCicilan.map(c => ({
            id: c.id,
            bulanKe: c.bulanKe,
            tanggalJatuhTempo: c.tanggalJatuhTempo ? c.tanggalJatuhTempo.toISOString() : null, // Store as String
            nominal: c.nominal,
            sudahLunas: c.sudahLunas,
            tanggalDibayar: c.tanggalDibayar ? c.tanggalDibayar.toISOString() : null
        }))
    }));

    const { ref, set } = window.firebaseLib;
    set(ref(db, userPath), data);
}

// ==========================================
// MODELS (Modified for Sync)
// ==========================================

class Cicilan {
    constructor(id, bulanKe, tanggalJatuhTempo, nominal, sudahLunas) {
        this.id = id;
        this.bulanKe = bulanKe;
        this.tanggalJatuhTempo = new Date(tanggalJatuhTempo); // Auto parse ISO string
        this.nominal = nominal;
        this.sudahLunas = sudahLunas;
        this.tanggalDibayar = null;
    }
}

class SumberHutang {
    constructor(namaSumber) {
        this.id = "source_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        this.namaSumber = namaSumber;
        this.daftarCicilan = [];
        this.isExpanded = false;
    }

    tambahCicilan(bulanKe, tanggalJatuhTempo, nominal, sudahLunas) {
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        const cicilanBaru = new Cicilan(id, bulanKe, tanggalJatuhTempo, nominal, sudahLunas);
        this.daftarCicilan.push(cicilanBaru);
        this.daftarCicilan.sort((a, b) => a.tanggalJatuhTempo - b.tanggalJatuhTempo);
    }

    getTanggalTerdekat() {
        const belumLunas = this.daftarCicilan.find(c => !c.sudahLunas);
        if (!belumLunas) return new Date('9999-12-31');
        return belumLunas.tanggalJatuhTempo;
    }

    hitungSisa() {
        return this.daftarCicilan
            .filter(c => !c.sudahLunas)
            .reduce((total, c) => total + c.nominal, 0);
    }

    getProgress() {
        const total = this.daftarCicilan.length;
        const lunas = this.daftarCicilan.filter(c => c.sudahLunas).length;
        return { lunas, total, persentase: total === 0 ? 100 : (lunas / total) * 100 };
    }
}

class PengelolaHutang {
    constructor() {
        this.semuaSumber = [];
    }

    tambahSumber(sumber) {
        this.semuaSumber.push(sumber);
    }

    getSortedSources() {
        return [...this.semuaSumber].sort((a, b) => {
            const dateA = a.getTanggalTerdekat();
            const dateB = b.getTanggalTerdekat();
            return dateA - dateB;
        });
    }

    hasilkanTotal() {
        let totalHutang = 0;
        let totalCicilan = 0;
        let totalLunas = 0;

        this.semuaSumber.forEach(sumber => {
            totalHutang += sumber.hitungSisa();
            const prog = sumber.getProgress();
            totalCicilan += prog.total;
            totalLunas += prog.lunas;
        });

        return {
            sisaUang: totalHutang,
            persenGlobal: totalCicilan === 0 ? 100 : (totalLunas / totalCicilan) * 100,
            statistik: `${totalLunas} / ${totalCicilan} Lunas`
        };
    }

    shouldHide(cicilan) {
        if (!cicilan.sudahLunas) return false;
        if (!cicilan.tanggalDibayar) return true;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const payDate = new Date(cicilan.tanggalDibayar);
        payDate.setHours(0, 0, 0, 0);
        return payDate < today;
    }

    tambahSumberOtomatis(nama, jumlahBulan, startTanggal, nominal) {
        const sumberBaru = new SumberHutang(nama);
        const startDate = new Date(startTanggal);
        for (let i = 1; i <= jumlahBulan; i++) {
            let dueDate = new Date(startDate);
            dueDate.setMonth(startDate.getMonth() + (i - 1));
            sumberBaru.tambahCicilan(i, dueDate, nominal, false);
        }
        this.tambahSumber(sumberBaru);
        return sumberBaru;
    }

    updateCicilan(sourceId, cicilanId, nominalBaru, tanggalBaru) {
        const sumber = this.semuaSumber.find(s => s.id === sourceId);
        if (!sumber) return;
        const cicilan = sumber.daftarCicilan.find(c => c.id === cicilanId);
        if (cicilan) {
            cicilan.nominal = parseInt(nominalBaru);
            if (tanggalBaru) {
                cicilan.tanggalJatuhTempo = new Date(tanggalBaru);
                sumber.daftarCicilan.sort((a, b) => a.tanggalJatuhTempo - b.tanggalJatuhTempo);
            }
        }
    }

    hapusSumber(sourceId) {
        this.semuaSumber = this.semuaSumber.filter(s => s.id !== sourceId);
        if (db && userPath) {
            saveData(); // Sync removal to cloud
        }
    }

    resetAllData() {
        // Hapus data di Cloud
        if (db && userPath) {
            const { ref, set } = window.firebaseLib;
            set(ref(db, userPath), null); // Set NULL to delete
        }
        this.semuaSumber = [];
        renderUI();
    }
}

// ==========================================
// INIT INSTANCE
// ==========================================
const aplikasiSaya = new PengelolaHutang();

// Note: loadData() and localStorage logic are completely replaced by Firebase Sync logic above.
