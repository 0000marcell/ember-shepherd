import Ember from 'ember';

const {A, Evented, K, Service, isPresent, run, $, isEmpty} = Ember;
/**
 * Taken from introjs https://github.com/usablica/intro.js/blob/master/intro.js#L1092-1124
 * Get an element position on the page
 * Thanks to `meouw`: http://stackoverflow.com/a/442474/375966
 */
function getElementPosition(element) {
  let elementPosition = {
    height: element.offsetHeight,
    width: element.offsetWidth
  };

  //calculate element top and left
  let x = 0;
  let y = 0;
  while (element && !isNaN(element.offsetLeft) && !isNaN(element.offsetTop)) {
    x += element.offsetLeft;
    y += element.offsetTop;
    element = element.offsetParent;
  }

  elementPosition.top = y;
  elementPosition.left = x;
  return elementPosition;
}


export default Service.extend(Evented, {
  // Configuration Options
  defaults: {},
  disableScroll: false,
  errorTitle: null,
  messageForUser: null,
  modal: false,
  requiredElements: A(),
  steps: A(),

  start() {
    this.setup();
    this.get('tourObject').start();
  },

  back() {
    this.get('tourObject').back();
    this.trigger('back');
  },

  cancel() {
    this.get('tourObject').cancel();
  },

  next() {
    this.get('tourObject').next();
    this.trigger('next');
  },

  onTourStart() {
    if (this.get('modal')) {
      $('body').append('<div id="shepherdOverlay"></div>');
    }
    if (this.get('disableScroll')) {
      $(window).disablescroll();
    }
    this.trigger('start');
  },

  onTourComplete() {
    this.cleanup();
    this.trigger('complete');
  },

  onTourCancel() {
    this.cleanup();
    this.trigger('cancel');
  },

  /**
   * Sets up the tour object, check for required elements and load steps
   * @private
   */
  setup() {
    const defaults = this.get('defaults');
    const tour = new Shepherd.Tour({defaults});

    this.set('tourObject', tour);

    // Only need to do these once, since it's recreated each time
    tour.once('start', run.bind(this, 'onTourStart'));
    tour.once('complete', run.bind(this, 'onTourComplete'));
    tour.once('cancel', run.bind(this, 'onTourCancel'));

    const steps = this.get('steps');

    // Return nothing if there are no steps
    if (isEmpty(steps)) {
      return;
    }
    if (!this.requiredElementsPresent()) {
      tour.addStep('error', {
        buttons: [{
          text: 'Exit',
          action: tour.cancel
        }],
        classes: 'shepherd shepherd-open shepherd-theme-arrows shepherd-transparent-text',
        copyStyles: false,
        title: this.get('errorTitle'),
        text: [this.get('messageForUser')]
      });
      return;
    }

    // Process each step
    steps.forEach((step, index) => {
      let { id, options } = step;
      options.buttons = options.builtInButtons.map(this.makeButton, this);
      options.attachTo = this.normalizeAttachTo(options.attachTo);
      tour.addStep(id, options);

      // Step up events for the current step
      let currentStep = tour.steps[index];
      currentStep.on('before-show', () => {
        if (this.get('modal')) {
          const currentElement = this.getElementForStep(currentStep);
          if (currentElement) {
            currentElement.style.pointerEvents = 'none';
            if (currentStep.options.copyStyles) {
              this.createHighlightOverlay(currentStep);
            } else {
              this.popoutElement(currentStep);
            }
          }
        }
      });
      currentStep.on('hide', () => {
        //Remove element copy, if it was cloned
        const currentElement = this.getElementForStep(currentStep);
        if (currentElement) {
          if (currentStep.options.highlightClass) {
            $(currentElement).removeClass(currentStep.options.highlightClass);
          }
          $('#highlightOverlay').remove();
        }
      });

      let $window = $(window);

      // Allow scrollbar scrolling so scrollTo works.
      currentStep.options.scrollToHandler = (elem) => {
        $window.disablescroll({
          handleScrollbar: false
        });

        if (typeof elem !== 'undefined') {
          elem.scrollIntoView();
        }

        $window.disablescroll(this.get('disableScroll') ? undefined : 'undo');
      };
    });
  },

  /**
   * Cleanup the modal leftovers, like the overlay and highlight, so they don't hang around.
   * @private
   */
  cleanup() {
    if (this.get('disableScroll')) {
      $(window).disablescroll('undo');
    }
    if (this.get('modal')) {
      let tour = this.get('tourObject');
      if (tour) {
        let steps = tour.steps;
        steps.map((step) => {
          let stepElement = this.getElementForStep(step);
          if (step && step.options.attachTo && stepElement) {
            stepElement.style.pointerEvents = 'auto';
          }
        });
      }
      run('afterRender', function () {
        $('#shepherdOverlay').remove();
        $('#highlightOverlay').remove();
        $('.shepherd-modal').removeClass('shepherd-modal');
      });
    }
    $('.shepherd-step').remove();
  },

  /**
   * Creates an overlay element clone of the element you want to highlight and copies all the styles.
   * @param step The step object that points to the element to highlight
   */
  createHighlightOverlay(step) {
    $('#highlightOverlay').remove();
    const currentElement = this.getElementForStep(step);
    if (currentElement) {
      const elementPosition = getElementPosition(currentElement);
      const highlightElement = $(currentElement).clone();
      highlightElement.attr('id', 'highlightOverlay');
      $('body').append(highlightElement);
      highlightElement[0].style.cssText = window.getComputedStyle(currentElement).cssText;
      //Style all internal elements as well
      const children = $(currentElement).children();
      const clonedChildren = highlightElement.children();

      for (let i = 0; i < children.length; i++) {
        clonedChildren[i].style.cssText =
          window.getComputedStyle(children[i]).cssText;
      }

      highlightElement.css({
        'position': 'absolute',
        'left': elementPosition.left,
        'top': elementPosition.top,
        'width': elementPosition.width,
        'height': elementPosition.height,
        'z-index': 10002
      });
    }
  },

  /**
   * Return the element for a step
   *
   * @method getElementForStep
   * @param step step the step to get an element for
   * @returns {Element} the element for this step
   * @private
   */
  getElementForStep(step) {
    const attachTo = step.options.attachTo;
    if (!attachTo) {
      return null;
    }

    const type = typeof attachTo;
    let element;
    if (type === 'string') {
      element = this.getElementFromString(attachTo);
    }
    else if (type === 'object') {
      element = this.getElementFromObject(attachTo);
    }
    else {
      element = null;
    }
    return element;
  },

  /**
   * Get the element from an option object
   *
   * @method getElementFromObject
   * @param Object attachTo
   * @returns {Element}
   * @private
   */
  getElementFromObject(attachTo) {
    const op = attachTo.element;
    return $(op).get(0);
  },

  /**
   * Get the element from an option string
   *
   * @method getElementFromString
   * @param element the string in the step configuration
   * @returns {Element} the element from the string
   * @private
   */
  getElementFromString(element) {
    const attachTo = element.split(' ');
    attachTo.pop();
    const selector = attachTo.join(' ');
    return $(selector).get(0);
  },

  /**
   * Creates a button of the specified type, with the given classes and text
   *
   * @param type The type of button cancel, back, or next
   * @param classes Classes to apply to the button
   * @param text The text for the button
   * @param action The action to call
   * @returns {{action: *, classes: *, text: *}}
   */
  makeButton({ type, classes, text, action }) {
    if (type === 'cancel') {
      action = run.bind(this, function () {
        this.cancel();
      });
    } else if (type === 'back') {
      action = run.bind(this, function () {
        this.back();
      });
    } else if (type === 'next') {
      action = run.bind(this, function () {
        this.next();
      });
    } else {
      action = action || K;
    }
    return {action, classes, text};
  },

  /**
   * Check if attachTo is an object, if it is, put element and on into a string,
   * if it is already a string, just return that string
   *
   * @param attachTo
   * @returns {*}
   * @private
   */
  normalizeAttachTo(attachTo) {
    if (attachTo && typeof attachTo.element === 'string' && typeof attachTo.on === 'string') {
      return attachTo.element + ' ' + attachTo.on;
    } else {
      return attachTo;
    }
  },

  /**
   * Increases the z-index of the element, to pop it out above the overlay and highlight it
   *
   * @param step The step object that attaches to the element
   * @private
   */
  popoutElement(step) {
    $('.shepherd-modal').removeClass('shepherd-modal');
    const currentElement = this.getElementForStep(step);
    if (currentElement) {
      $(currentElement).addClass('shepherd-modal');
      if (step.options.highlightClass) {
        $(currentElement).addClass(step.options.highlightClass);
      }
    }
  },

  /**
   * Observes the array of requiredElements, which are the elements that must be present at the start of the tour,
   * and determines if they exist, and are visible, if either is false, it will stop the tour from executing.
   * @private
   */
  requiredElementsPresent() {
    let allElementsPresent = true;
    const requiredElements = this.get('requiredElements');
    if (isPresent(requiredElements)) {
      requiredElements.forEach((element) => {
        if (allElementsPresent && (!$(element.selector)[0] || !$(element.selector).is(':visible'))) {
          allElementsPresent = false;
          this.set('errorTitle', element.title);
          this.set('messageForUser', element.message);
        }
      });
    }
    return allElementsPresent;
  }
});
