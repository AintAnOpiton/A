// Source code for the mainCV.exe(compiled with Microsoft Visual Studio 2022, so don't expect CMAKELists.txt or the source code for opencv2(available online, compile and build on your own))

#include <iostream>
#include "opencv2/opencv.hpp"
#include "opencv2/imgproc.hpp"
#include "opencv2/objdetect.hpp"
#include <string>
#include <sys/stat.h>
#include <regex>

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#include <direct.h> // For _mkdir
#endif


using namespace cv; // Not the best practice, but std+cv are distinctive from each other, so may be permitted for a small project as such
using namespace std;


// Silence OpenCV logging to prevent any unnecessary info for listeners in render
namespace {
    struct LogSilencer {
        LogSilencer() {
#if CV_VERSION_MAJOR >= 4
            cv::utils::logging::setLogLevel(cv::utils::logging::LOG_LEVEL_SILENT);
#endif
        }
    } _logSilencer;
}


//Desktop path helper

std::string getDesktopPath() {
#ifdef _WIN32
    char path[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathA(NULL, CSIDL_DESKTOP, NULL, 0, path))) {
        return std::string(path);
    }
#endif
    return std::string(".");
}


// Hhighlight icon for detected faces - shape creating by CV
void drawRoundedRect(Mat& img, Rect face, int radius, Scalar fill, Scalar stroke, int thickness) {
    Mat mask(img.size(), img.type(), Scalar(0,0,0));
    rectangle(mask, face, fill, FILLED, LINE_AA);
    rectangle(img, face, stroke, thickness, LINE_AA);
}


// Whether dir exists

bool dirExists(const std::string& dirPath) {
    struct stat info;
    if (stat(dirPath.c_str(), &info) != 0) return false;
    return (info.st_mode & S_IFDIR) != 0;
}


// if not, create one

void createDirIfNotExists(const std::string& dirPath) {
#ifdef _WIN32
    _mkdir(dirPath.c_str());
#else
    mkdir(dirPath.c_str(), 0777);
#endif
}


// Helper func : is the path in temp?

bool isTempPath(const std::string& path) {
#ifdef _WIN32
    char tempPath[MAX_PATH];
    DWORD len = GetTempPathA(MAX_PATH, tempPath);
    if (len > 0 && len < MAX_PATH) {
        std::string tempStr(tempPath);
        // normalize slashes for better comparison
        std::string normPath = path;
        std::replace(normPath.begin(), normPath.end(), '\\', '/');
        std::replace(tempStr.begin(), tempStr.end(), '\\', '/');
        return normPath.find(tempStr) == 0;
    }
#endif
    return false;
}


// helper func to get output dir as string

std::string getOutputDir(const std::string& inputPath) {
    if (isTempPath(inputPath)) {
        std::string outDir = getDesktopPath() + "/Results_of_Detection";
        if (!dirExists(outDir)) createDirIfNotExists(outDir);
        return outDir;
    }
    size_t lastSlash = inputPath.find_last_of("/\\");
    std::string baseDir = (lastSlash != std::string::npos) ? inputPath.substr(0, lastSlash) : getDesktopPath(); //Even tho I use std namespace, std::string for precaution - same for other, std-specified funcs
    std::string outDir = baseDir + "/Results_of_Detection";
    if (!dirExists(outDir)) createDirIfNotExists(outDir);
    return outDir;
}


// is string a url?

bool isURL(const std::string& path) {
    std::regex url_regex(R"(^https?://)", std::regex::icase);
    return std::regex_search(path, url_regex);
}


// Face detection for image (local or url)

std::string processImage(const std::string& imgPath) {
    CascadeClassifier face_cascade;
    if (!face_cascade.load("haarcascade_frontalface_default.xml")) {
        std::cerr << "[AI LOG] Error: Could not load Haar cascade XML file." << std::endl;
        return "";
    }
    // is the file written and readable?

    struct stat st;
    int statResult = stat(imgPath.c_str(), &st);
    if (statResult != 0 || st.st_size == 0) {
        std::cerr << "[AI LOG] File not ready or empty: " << imgPath << std::endl;
        return "";
    }
    std::cerr << "[AI LOG] File ready for reading: " << imgPath << " Size: " << st.st_size << " bytes" << std::endl;
    // open and resave to normalize encoding

    Mat img = imread(imgPath);
    if (img.empty()) {
        std::cerr << "[AI LOG] Error: Image is empty or cannot be loaded: " << imgPath << std::endl;
        return "";
    }

    std::string tempNormPath = imgPath + ".norm.png";

    imwrite(tempNormPath, img);
    Mat normImg = imread(tempNormPath);
    if (normImg.empty()) {
        std::cerr << "[AI LOG] Error: Normalized image could not be loaded: " << tempNormPath << std::endl;
        return "";
    }

    std::cerr << "[AI LOG] Normalized image loaded: " << tempNormPath << " Size: " << normImg.cols << "x" << normImg.rows << " Channels: " << normImg.channels() << std::endl;

    // Bettering AI detection with: grayscale, histogram equalization, Canny edge detection

    Mat gray;
    cvtColor(normImg, gray, COLOR_BGR2GRAY);
    cv::equalizeHist(gray, gray);
    Mat edges;
    Canny(gray, edges, 100, 200);

    // Face detection itself
    std::vector<Rect> faces;
    face_cascade.detectMultiScale(gray, faces, 1.1, 5, 0, Size(50, 50));
    std::cerr << "[AI LOG] Faces detected: " << faces.size() << std::endl;
    for (const auto& face : faces) {
        drawRoundedRect(normImg, face, 15, Scalar(0xd9,0xd9,0xd9), Scalar(255,255,255), 3);
    }

    // Double down with HOG

    HOGDescriptor hog;
    hog.setSVMDetector(HOGDescriptor::getDefaultPeopleDetector());
    std::vector<Rect> people;
    hog.detectMultiScale(normImg, people, 1.5, Size(16,16), Size(64,64), 1.1, 4);
    std::cerr << "[AI LOG] People detected: " << people.size() << std::endl;

    // If face or person found, save output
    std::string outDir = getOutputDir(imgPath);
    size_t dot = imgPath.find_last_of('.');
    size_t slash = imgPath.find_last_of("/\\");
    std::string stem = (slash != std::string::npos && dot != std::string::npos && dot > slash) ? imgPath.substr(slash+1, dot-slash-1) : "output";
    std::string ext = (dot != std::string::npos) ? imgPath.substr(dot) : ".png";
    std::string outPath = outDir + "/" + stem + ext;
    imwrite(outPath, normImg);


    remove(tempNormPath.c_str());

    // if no people or faces, return empty for it to save the base image instead(later implemented)
    if (faces.empty() && people.empty()) {
        return "";
    }
    return outPath;
}


// Face detection for video (local or url
std::string processVideo(const std::string& vidPath) {
    CascadeClassifier face_cascade;
    if (!face_cascade.load("haarcascade_frontalface_default.xml")) {
        std::cerr << "[AI LOG] Error: Could not load Haar cascade XML file." << std::endl;
        return "";
    }
    VideoCapture cap;
    if (isURL(vidPath)) {
        cap.open(vidPath);
    } else {
        cap.open(vidPath);
    }
    if (!cap.isOpened()) {
        std::cerr << "[AI LOG] Error: Video cannot be opened: " << vidPath << std::endl;
        return "";
    }
    int fourcc = static_cast<int>(cap.get(CAP_PROP_FOURCC));
    double fps = cap.get(CAP_PROP_FPS);
    Size size((int)cap.get(CAP_PROP_FRAME_WIDTH), (int)cap.get(CAP_PROP_FRAME_HEIGHT));
    std::string outDir = getOutputDir(vidPath);
    size_t dot = vidPath.find_last_of('.');
    size_t slash = vidPath.find_last_of("/\\");
    std::string stem = (slash != std::string::npos && dot != std::string::npos && dot > slash) ? vidPath.substr(slash+1, dot-slash-1) : "output";
    std::string ext = (dot != std::string::npos) ? vidPath.substr(dot) : ".mp4";
    std::string outPath = outDir + "/" + stem + "_faces" + ext;
    VideoWriter writer(outPath, fourcc, fps, size);
    if (!writer.isOpened()) {
        std::cerr << "[AI LOG] Error: VideoWriter cannot be opened: " << outPath << std::endl;
        return "";
    }
    Mat frame;
    int frameCount = 0;
    while (cap.read(frame)) {
        Mat gray;
        cvtColor(frame, gray, COLOR_BGR2GRAY);
        cv::equalizeHist(gray, gray);
        std::vector<Rect> faces;
        face_cascade.detectMultiScale(gray, faces, 1.1, 5, 0, Size(50, 50));
        std::cerr << "[AI LOG] Frame " << frameCount << ": Faces detected: " << faces.size() << std::endl;
        for (const auto& face : faces) {
            drawRoundedRect(frame, face, 15, Scalar(0xd9,0xd9,0xd9), Scalar(255,255,255), 3);
        }
        writer.write(frame);
        frameCount++;
    }
    cap.release();
    writer.release();
    return outPath;
}


int main(int argc, char* argv[]) {
    if (argc > 1) {
        std::string inputPath = argv[1];
        size_t dot = inputPath.find_last_of('.');
        std::string ext = (dot != std::string::npos) ? inputPath.substr(dot) : "";
        std::string outPath;
        if (ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".bmp" || ext == ".gif") { //Stick to those mentioned in renderer
            outPath = processImage(inputPath);
        } 
        else if (ext == ".mp4" || ext == ".avi" || ext == ".mov" || ext == ".mkv" || ext == ".webm") {
            outPath = processVideo(inputPath);
        }

        // Begin logic mentioned in line 188
        if (!outPath.empty()) {
            std::cout << outPath << std::endl;
        } else {
            // even if detection failed, construct path
            std::string outDir = getOutputDir(inputPath);
            size_t slash = inputPath.find_last_of("/\\");
            std::string stem = (slash != std::string::npos && dot != std::string::npos && dot > slash) ? inputPath.substr(slash+1, dot-slash-1) : "output";
            std::string outFile = outDir + "/" + stem + ".png";
            std::cout << outFile << std::endl;
        }
    } else {
        std::cout << "No path received." << std::endl;
    }
    return 0;
} 