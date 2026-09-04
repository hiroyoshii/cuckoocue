import XCTest

final class CuckooCueScreenshotTests: XCTestCase {
    func testWidgetGalleryIsAccessibleAtAllSizes() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--screenshot-gallery"]
        app.launch()

        let preview = app.otherElements["widget-preview"]
        XCTAssertTrue(preview.waitForExistence(timeout: 5))

        for label in ["Small", "Medium", "Large"] {
            app.buttons[label].tap()
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "CuckooCue-Widget-\(label)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}

