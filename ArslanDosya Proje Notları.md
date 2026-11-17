# ArslanDosya — Proje Notları

> Bu dosyayı ve **ArslanDosya Proje.zip** dosyasını yeni bir sohbete yükleyin.
> Claude'a: "Bu ArslanDosya projem, notları oku, şu değişikliği yapalım: …" demeniz yeterli.

Son güncelleme: 13 Kasım 2026

---

## 1. Uygulama ne yapıyor?

Android uygulaması (APK). Telefondaki tüm **PDF, Excel, Word ve PowerPoint** dosyalarını tek yerde listeler, uygulamanın içinde açar, siler, paylaşır.

**Çalışan özellikler:**
- **Liste:** Tüm telefonu tarar ("Tüm dosyalara erişim" izniyle). WhatsApp klasörleri dahil; Telegram'ın özel klasörü hariç, çünkü Android buna izin vermiyor.
- **Sekmeler:** Tümü · PDF · Excel · Word · Sunum. Tek ekrana sığar, kaydırma yok.
- **Üst buton şeridi:** Son açılan · Favoriler · Kopyalar · Sırala · Yenile. Simgenin altında küçük adı yazar.
- **Arama ve sıralama:** Dosya adına göre arama; tarih, ad veya boyuta göre sıralama.
- **Dosya satırı:** Tür rozeti (PDF/XLS/DOC/PPT), kaynak (WhatsApp, İndirilenler…), boyut, tarih, ★ favori işareti ve YENİ etiketi.
- **Paylaşım:** Her dosyanın altında WhatsApp / Telegram / Gmail butonları. Telefonda yüklü uygulamanın gerçek ikonu gösterilir; yüklü olmayan görünmez.
- **Silme:** 🗑️ butonu hemen siler, 3 saniye **GERİ AL** çıkar. Toplu silmede de aynı.
- **3 nokta menüsü:** Aç, Favorilere ekle/çıkar, Yeniden adlandır, Başka uygulamada aç, Diğer paylaşım, Seç, Sil.
- **Basılı tutma:** Çoklu seçim açılır; üst çubukta ⭐ favori, paylaş ve sil butonları çıkar.
- **Kopya dosyalar:** İçeriği aynı dosyaları gruplar. En eski dosya kalır, diğerleri işaretli gelir; toplu silinir.
- **Son açılanlar:** Son 30 dosya. **Favoriler:** kalıcıdır.
- **Otomatik yenileme:** Uygulamaya dönünce ve İndirilenler/WhatsApp/Telegram klasörlerine yeni dosya gelince liste kendiliğinden yenilenir. Ayrıca aşağı çekince yenilenir.
- **Paylaş → ArslanDosya:** Başka uygulamadan paylaşılan dosya İndirilenler › ArslanDosya klasörüne kaydedilir.
- **Başka uygulamadan açma:** WhatsApp vb.'den "aç" denince sadece görüntüleme ekranı açılır; geri basınca o uygulamaya dönülür.
- **Belge içinde arama:** Excel / Word / Sunum'da vurgulu arama, ▲▼ ile gezinme. PDF'de sayfa sonuçları listelenir, dokununca sayfaya gider.

**Görüntüleyiciler:**
- **PDF:** Android'in kendi PdfRenderer'ı. İki parmakla yakınlaştırma var; yakınlaştırma parmakların ortasındaki noktaya doğru yapılır (o nokta yerinde kalır), diğer görüntüleyicilerdeki gibi.
- **Excel (.xlsx/.csv):** Kendi yazdığımız okuyucu. Renkler, kenarlıklar, birleştirilmiş hücreler, ₺/%/tarih biçimleri görünür. Açılınca ekrana sığar, telefonun kendi yakınlaştırması kullanılır. Eski **.xls** için SheetJS kullanılır, derlemede indirilir.
- **Word (.docx):** Kendi okuyucumuz. Başlıklar, biçimler, listeler, tablolar (stil bantları dahil) ve resimler görünür.
- **PowerPoint (.pptx):** Kendi okuyucumuz. Arka planlar, ana slayt süsleri, serbest şekiller, tablolar ve grafikler (sütun/çubuk/çizgi/pasta/halka) görünür. İlk slayt hemen açılır, diğerleri arkada hazırlanır.
- **Eski .doc / .ppt:** İçeride açılmaz, "Başka uygulamada aç" önerilir.

## 2. Tasarım kararları (kullanıcı onayladı)
- **"B · Sade Beyaz"** tasarım. Telefon karanlık modda olsa da **hep beyaz**.
- **Renkler:** Lacivert #1E3A8A ana renk, sarı #F59E0B vurgu. Tür renkleri: PDF kırmızı, Excel yeşil, Word mavi, Sunum turuncu.
- **Çerçeveler (kullanıcı istedi):** Belirgin çizgiler kullanılır.
  - **Dosya satırları:** Her dosya ayrı bir kutuda. Köşeler yuvarlak (14dp), çerçeve 1dp gri #C9CED8, kutular arasında boşluk var. Seçili dosyada çerçeve 2dp lacivert.
  - **Paylaşım satırı:** Kutu içinde ince bir çizgiyle ayrılır. WhatsApp/Telegram/Gmail butonları kendi renginde çerçeveli küçük kutular.
  - **Sil / 3 nokta:** Çerçeveli kare butonlar; sil kırmızı, menü gri çerçeveli.
  - **Üstteki 5 isimli buton:** Çerçeveli kare; seçili olan kalın renkli çerçeveli. Arama kutusu da çerçeveli.
- **Yazı büyütme sınırı:** En fazla 1,15. Kullanıcının telefonunda yazı boyutu büyük, bu sınır olmadan düzen kayıyordu.
- **İkon:** Lacivert zemin, sarı klasör, içinden çıkan belgeler, "A" harfi.
- **Excel yakınlaştırma:** Telefonun kendi yakınlaştırması **çalışıyor ve kullanıcı bundan memnun**. Bir ara + / − butonlu kendi yakınlaştırmamızı denedik, kullanıcı isteğiyle geri aldık; değiştirmeyin.

## 3. Derleme (APK nasıl yapılıyor?)
- **Depo:** GitHub: `mehmetarslankurumsalgsb-gif/ArslanDosya`
- **Otomatik derleme:** Dosyalar yüklenince GitHub Actions APK'yı kendisi yapar. Actions → son çalıştırma → Artifacts → **ArslanDosya** zip'i → içinde APK.
- **Workflow dosyası:** `.github/workflows/build.yml`, Java 17, Gradle 8.9. GitHub web yüklemesi `.github` klasörünü almadığı için bu dosya elle oluşturuldu.
- **İmza:** Sabit imza anahtarı `app/arslan.jks` (şifre arslan123). Her yeni APK eskisinin üzerine kurulur.
- **Yükleme:** Zip'i ayıkla → GitHub'da **Add file → Upload files** → hepsini sürükle → **Commit changes**.

## 4. Kod yapısı
`app/src/main/java/com/arslan/dosya/`
| Dosya | Görevi |
|---|---|
| MainActivity.kt | Ana ekran, izin, klasör izleme, "Paylaş" ile gelen dosyalar |
| MainScreen.kt | Ana ekran tasarımı (başlık, buton şeridi, sekmeler, dosya satırı) |
| MainViewModel.kt | Liste, sıralama, favoriler, son açılanlar, geri alınabilir silme, kopyalar |
| Kopyalar.kt | Kopya dosyalar ekranı |
| Dosyalar.kt | Dosya türleri, tarama, paylaş/aç/sil, Recent, Duplicates |
| Paylasim.kt | WhatsApp/Telegram/Gmail butonları (gerçek uygulama ikonu) |
| ViewerActivity.kt | Görüntüleyici ekranı, arama çubuğu, PDF görüntüleyici, web görüntüleyici köprüsü |
| DisaridanAcActivity.kt | Başka uygulamadan açılan dosyalar (geri → o uygulama) |
| Tema.kt | Renkler, tema, tür renkleri/etiketleri |

`app/src/main/assets/viewer/` (görüntüleyiciler, WebView içinde çalışır; internet gerekmez)
| Dosya | Görevi |
|---|---|
| common.js | Zip/XML yardımcıları, Android köprüsü, resim küçültme, **Find** (belge içi arama) |
| excel.html/.js/.css | Excel okuyucu ve çizici |
| docx.html/.js | Word okuyucu |
| pptx.html/.js, chart.js | Sunum okuyucu ve grafik çizici |
| pdfsearch.html | PDF içinde yazı arama (PDF.js) |
| lib/jszip.min.js, lib/pdfjs/ | Hazır kütüphaneler (uygulamanın içinde) |

## 5. Çalışma şekli (Claude için)
- **Kullanıcı tercihleri:** Teknik konuda tecrübesiz. **Adım adım, tek seferde bir talimat**, kısa ve sade anlatım istiyor. Emin olunmayan durumda varsayım yapmadan soru sorulmasını istiyor.
- **Dosya adı:** Güncel kod her seferinde **aynı adla** verilir: `ArslanDosya Proje.zip`. Dosya adları Türkçe karakterli olur, alt çizgi yerine boşluk kullanılır.
- **Test:** Görüntüleyicileri (assets/viewer) vermeden önce **mutlaka test et**: Playwright + Chromium, telefon ekranı taklidi (412×915, isMobile). Test dosyalarını python-docx / python-pptx / openpyxl / pptxgenjs ile üret, LibreOffice ile karşılaştırma görüntüsü al. Kullanıcı test edilmeden verilen sürümden rahatsız olmuştu.
- **Android tarafı:** Kotlin/Compose bu ortamda tam derlenemiyor (Android kütüphanelerine erişim yok). Gradle'ın içindeki Kotlin derleyicisiyle sadece yazım hatası kontrolü yapılabiliyor.
- **Kullanıcı onayı:** Büyük tasarım değişikliklerinden önce Design canvas ile seçenek göster, kullanıcı seçsin.

## 6. İleride düşünülebilecekler
- Klasör görünümü (WhatsApp / İndirilenler / Telegram ayrı ayrı)
- Büyük dosyaları bulma (en çok yer kaplayanlar)
- Eski .doc / .ppt desteği

## 7. 13 Kasım 2026 değişiklikleri
- **Yapay Zeka butonu:** Dosya satırının altında WhatsApp/Telegram/Gmail'in yanında. Dokununca Claude · ChatGPT · Gemini · DeepSeek listesi açılır. Uygulama telefonda yüklüyse dosya ekli açılır, yüklü değilse sitesi tarayıcıda açılır (`Paylasim.kt` → `AiApp`, `AiButton`; AndroidManifest `queries`'e paketler eklendi).
- **İndir butonu:** Dosya satırında ve görüntüleyici üst çubuğunda. Dosyanın kopyasını İndirilenler klasörüne koyar; aynı ad varsa `dosya (1).pdf` gibi yeni ad verir, üzerine yazmaz (`Dosyalar.kt` → `FileActions.download`).
- **PDF kaydırma takılması düzeltildi:** Eskiden çizilen sayfa ekrandan çıkınca atılıyor, geri gelince baştan çiziliyordu; yer tutucu sayfa boyutu da gerçekten farklı olduğu için yukarı çıkarken sıçrama oluyordu. Şimdi: sayfa boyutları baştan okunur, çizilen sayfalar bellekte tutulur (LruCache), hızlı kaydırmada geçilen sayfalar çizilmez, eski çözünürlük yeni gelene kadar gösterilir.
- **PowerPoint kaydırma takılması düzeltildi:** Arka planda tüm slaytları sürekli çizmek kaydırmayı donduruyordu. Şimdi sadece ekrana yaklaşan slayt çizilir, 10'dan uzun sunumlarda çok uzaktaki slaytlar bellekten bırakılır, ekran dışı slaytlar çizilmez (`content-visibility`), kaydırma sırasında ağır iş yapılmaz.
- **PowerPoint görselleri:** Şekil içindeki kırpılmış resimler artık doğru kırpılıyor; resimler 1600 px'e küçültülüp sırayla işleniyor (bellek taşması resmin eksik görünmesine yol açıyordu); EMF/WMF gibi çizilemeyen resimlerin yerinde "Görsel gösterilemiyor" kutusu çıkıyor.
- **Test:** Web kısmı (PowerPoint görüntüleyici) Edge ile gerçek iki sunumda denendi. Kotlin/Android kısmı bu ortamda derlenemedi; GitHub Actions derlemesi ilk gerçek test olacak.
